#!/usr/bin/env python3

"""
Generate core module inventory with AI-powered descriptions.

Scans packages/ for TypeScript and Python modules. Uses ollama/transformers
to generate descriptions for each module based on code analysis.

Outputs:
- docs/MOC/CORE_MAP_OF_CONTENT.json - Machine-readable inventory
- docs/MOC/CORE_MAP_OF_CONTENT.md - Human-readable documentation
- docs/MOC/CORE_MAP_OF_CONTENT.csv - Spreadsheet-compatible format

Author: @darianrosebrook
"""

import ast
import gc
import json
import re
import signal
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from datetime import datetime
from functools import lru_cache
from pathlib import Path
from typing import Dict, List, Optional, Tuple

# Import shared staleness assessment
from staleness_assessment import (
    assess_staleness,
    StalenessLevel,
    DEPRECATED_IMPORTS,
)

# Global state for graceful shutdown
_SHUTDOWN_REQUESTED = False
_INVENTORY_STATE = {"inventory": [], "json_output": None}


def _signal_handler(signum, frame):
    """Handle Ctrl+C by saving current progress."""
    global _SHUTDOWN_REQUESTED
    _SHUTDOWN_REQUESTED = True
    print("\n\n⚠️  Interrupt received! Saving progress...")

    inventory = _INVENTORY_STATE.get("inventory", [])
    json_output = _INVENTORY_STATE.get("json_output")

    if inventory and json_output:
        try:
            # Sort before saving
            inventory.sort(key=lambda x: x.get("path", ""))
            generate_json(inventory, json_output)
            print(f"✓ Saved {len(inventory)} entries to {json_output}")
            print("  Restart with --resume to continue from this point.")
        except Exception as e:
            print(f"✗ Failed to save: {e}")
    else:
        print("  No progress to save yet.")

    sys.exit(130)  # Standard exit code for Ctrl+C

# Try to import transformers for faster generation
try:
    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer, LogitsProcessor

    TRANSFORMERS_AVAILABLE = True
except ImportError:
    TRANSFORMERS_AVAILABLE = False
    torch = None  # Prevent NameError when checking torch.backends later
    LogitsProcessor = None


# Model path discovery - try multiple common locations
def _discover_model_path() -> Optional[str]:
    """Discover the Olmo model path from common locations."""
    candidates = [
        Path.home() / "Desktop/Projects/models/olmo-3-7b-instruct",
        Path.home() / "Desktop/Projects/models/Olmo-3-7B-Instruct",
        Path("/Users/darianrosebrook/Desktop/Projects/models/olmo-3-7b-instruct"),
        Path("/Users/darianrosebrook/Desktop/Projects/models/Olmo-3-7B-Instruct"),
        # HuggingFace cache locations
        Path.home() / ".cache/huggingface/hub/models--allenai--Olmo-3-7B-Instruct",
    ]
    for candidate in candidates:
        if candidate.exists():
            return str(candidate)
    # Return first candidate as default even if not found
    return str(candidates[0])


DEFAULT_MODEL_PATH = _discover_model_path()


# Global model instance for reuse across calls
_GLOBAL_MODEL = None
_GLOBAL_TOKENIZER = None
_GLOBAL_DEVICE = None

# File content cache to avoid repeated reads
_FILE_CONTENT_CACHE: Dict[str, str] = {}


@dataclass
class FileContext:
    """Cached file context to avoid repeated parsing."""
    path: Path
    content: str = ""
    lines: int = 0
    ast_tree: Optional[ast.AST] = None
    docstring: str = ""
    parse_error: bool = False


def _get_file_content(file_path: Path) -> str:
    """Get file content with caching."""
    key = str(file_path)
    if key not in _FILE_CONTENT_CACHE:
        try:
            _FILE_CONTENT_CACHE[key] = file_path.read_text(encoding="utf-8")
        except Exception:
            _FILE_CONTENT_CACHE[key] = ""
    return _FILE_CONTENT_CACHE[key]


def _clear_file_cache():
    """Clear the file content cache to free memory."""
    global _FILE_CONTENT_CACHE
    _FILE_CONTENT_CACHE = {}

# Project context for AI understanding
PROJECT_CONTEXT = """
Conscious-bot: an embodied AI agent with hierarchical reasoning. Monorepo (packages/).

When describing modules, refer to this project as "conscious-bot" or "the bot", never "Sterling".

Packages:
- cognition: LLM integration, thought processing, intent extraction, cognitive stream
- core: Shared utilities, TTS, API clients, base types
- planning: Task integration, cognitive thought processor, planner
- memory: Vector DB, reflection memory, hybrid search
- minecraft-interface: Minecraft client, leaves, interaction, navigation
- world: World state, observation queue
- safety: Safety checks and guards
- dashboard: Next.js dashboard, viewer HUD
- executor-contracts: Planning executor contracts
- evaluation: Test scenarios and evaluation
- testkits: P03/P21 conformance suites
"""

# Module categories based on packages/ directory structure
MODULE_CATEGORIES = {
    "cognition": "LLM integration, thought processing, intent extraction, cognitive stream",
    "core": "Shared utilities, TTS, API clients, base types",
    "planning": "Task integration, Sterling solver, cognitive thought processor",
    "memory": "Vector DB, reflection memory, hybrid search",
    "minecraft-interface": "Minecraft client, leaves, interaction, navigation",
    "world": "World state, observation queue",
    "safety": "Safety checks and guards",
    "dashboard": "Next.js dashboard, viewer HUD",
    "executor-contracts": "Planning executor contracts",
    "evaluation": "Test scenarios and evaluation",
    "testkits": "P03/P21 conformance suites",
    "mcp-server": "MCP server integration",
}

# Extended action verbs for description parsing
ACTION_VERBS = [
    # Primary actions
    "Provides", "Implements", "Defines", "Contains", "Manages",
    "Handles", "Processes", "Creates", "Generates", "Validates",
    "Parses", "Extracts", "Computes", "Tracks", "Maintains",
    "Enables", "Supports", "Integrates", "Derives", "Builds",
    # Governance/certification actions
    "Enforces", "Verifies", "Certifies", "Attests", "Witnesses",
    "Guards", "Gates", "Audits", "Records", "Logs",
    # Data flow actions
    "Loads", "Stores", "Serializes", "Deserializes", "Transforms",
    "Converts", "Maps", "Routes", "Dispatches", "Coordinates",
    # Search/reasoning actions
    "Searches", "Explores", "Expands", "Evaluates", "Scores",
    "Ranks", "Selects", "Filters", "Prunes", "Backtracks",
    # Orchestration actions
    "Orchestrates", "Configures", "Initializes", "Registers", "Binds",
]


def get_file_metadata(file_path: Path) -> Dict:
    """Get file metadata."""
    stat = file_path.stat()
    mtime = datetime.fromtimestamp(stat.st_mtime)

    try:
        ctime = datetime.fromtimestamp(stat.st_birthtime)
    except AttributeError:
        ctime = mtime

    # Use cached content for line count
    content = _get_file_content(file_path)
    line_count = len(content.splitlines()) if content else 0

    return {
        "created": ctime.isoformat(),
        "modified": mtime.isoformat(),
        "modified_days_ago": (datetime.now() - mtime).days,
        "size": stat.st_size,
        "size_bytes": stat.st_size,  # Alias for consistency
        "lines": line_count,
    }


def count_lines(file_path: Path) -> int:
    """Count lines in file (uses cache)."""
    content = _get_file_content(file_path)
    return len(content.splitlines()) if content else 0


def scan_todos(file_path: Path, base_path: Path = None) -> Dict[str, List[Dict[str, any]]]:
    """
    Scan file for TODO comments with priority tags.

    Supports Python (# TODO) and TypeScript/JS (// TODO, /* TODO */).
    Returns dict with keys: P0-GOV, P1-METRIC, P2-QUAL, P3-UX, untagged
    Each value is a list of dicts with: line_number, content, file_path
    """
    todo_pattern = re.compile(
        r'#?\s*TODO\[(P\d-[A-Z]+)\]:\s*(.+?)(?=\n|$)',
        re.IGNORECASE | re.MULTILINE
    )
    todo_js_pattern = re.compile(
        r'//\s*TODO\[(P\d-[A-Z]+)\]:\s*(.+?)$',
        re.IGNORECASE | re.MULTILINE
    )

    todos_by_priority = {
        "P0-GOV": [],
        "P1-METRIC": [],
        "P2-QUAL": [],
        "P3-UX": [],
        "untagged": []
    }

    try:
        content = _get_file_content(file_path)  # Use cached content
        if not content:
            return todos_by_priority
        lines = content.splitlines()
        
        # Calculate relative path if base_path provided
        if base_path:
            try:
                rel_path = str(file_path.relative_to(base_path))
            except ValueError:
                rel_path = str(file_path)
        else:
            rel_path = str(file_path)
        
        for line_num, line in enumerate(lines, start=1):
            match = todo_pattern.search(line) or todo_js_pattern.search(line)
            if match:
                priority_tag = match.group(1).upper()
                todo_content = match.group(2).strip()

                if priority_tag in todos_by_priority:
                    todos_by_priority[priority_tag].append({
                        "line_number": line_num,
                        "content": todo_content,
                        "file_path": rel_path
                    })
                else:
                    todos_by_priority["untagged"].append({
                        "line_number": line_num,
                        "content": f"[{priority_tag}] {todo_content}",
                        "file_path": rel_path
                    })
            elif "TODO" in line.upper():
                stripped = line.strip()
                is_comment = stripped and (
                    stripped.startswith("#")
                    or stripped.startswith("//")
                    or stripped.startswith("/*")
                    or (stripped.startswith("*") and not stripped.startswith("**"))
                )
                if is_comment and "TODO" in stripped.upper():
                    todos_by_priority["untagged"].append({
                        "line_number": line_num,
                        "content": stripped,
                        "file_path": rel_path
                    })
                    
    except Exception:
        pass  # Skip files that can't be read
    
    return todos_by_priority


def _get_decorator_names(node: ast.AST) -> List[str]:
    """Extract decorator names from a node."""
    decorators = []
    for dec in getattr(node, "decorator_list", []):
        if isinstance(dec, ast.Name):
            decorators.append(dec.id)
        elif isinstance(dec, ast.Attribute):
            decorators.append(dec.attr)
        elif isinstance(dec, ast.Call):
            if isinstance(dec.func, ast.Name):
                decorators.append(dec.func.id)
            elif isinstance(dec.func, ast.Attribute):
                decorators.append(dec.func.attr)
    return decorators


def _get_base_classes(node: ast.ClassDef) -> List[str]:
    """Extract base class names."""
    bases = []
    for base in node.bases:
        if isinstance(base, ast.Name):
            bases.append(base.id)
        elif isinstance(base, ast.Attribute):
            bases.append(base.attr)
        elif isinstance(base, ast.Subscript):
            if isinstance(base.value, ast.Name):
                bases.append(f"{base.value.id}[...]")
    return bases


def _extract_dataclass_fields(node: ast.ClassDef) -> List[str]:
    """Extract field names from a dataclass."""
    fields = []
    for item in node.body:
        if isinstance(item, ast.AnnAssign) and isinstance(item.target, ast.Name):
            fields.append(item.target.id)
    return fields[:10]  # Limit to 10 fields


def _extract_enum_values(node: ast.ClassDef) -> List[str]:
    """Extract enum member names."""
    values = []
    for item in node.body:
        if isinstance(item, ast.Assign):
            for target in item.targets:
                if isinstance(target, ast.Name) and target.id.isupper():
                    values.append(target.id)
    return values[:10]  # Limit to 10 values


def extract_typescript_context(content: str) -> Dict:
    """Extract context from TypeScript/JavaScript via regex (no AST)."""
    imports = []
    classes = []
    functions = []
    docstring = ""
    constants = []
    jsdoc_match = re.search(r"/\*\*([\s\S]*?)\*/", content)
    if jsdoc_match:
        docstring = re.sub(r"\s+", " ", jsdoc_match.group(1)).strip()[:500]
    for m in re.finditer(r'import\s+.*?\s+from\s+["\']([^"\']+)["\']', content):
        imports.append(m.group(1))
    for m in re.finditer(r'import\s+["\']([^"\']+)["\']', content):
        imports.append(m.group(1))
    for m in re.finditer(r"\bclass\s+(\w+)", content):
        classes.append(m.group(1))
    for m in re.finditer(r"\b(?:async\s+)?function\s+(\w+)\s*\(", content):
        functions.append(m.group(1))
    for m in re.finditer(r"\b(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(", content):
        if m.group(1) not in functions:
            functions.append(m.group(1))
    for m in re.finditer(r"\b(?:const|let)\s+([A-Z][A-Z0-9_]+)\s*=", content):
        constants.append(m.group(1))
    return {
        "content": content,
        "imports": imports[:15],
        "functions": functions[:15],
        "classes": classes[:15],
        "docstring": docstring,
        "summary": docstring[:200] if docstring else "",
        "content_preview": content[:1500] if content else "",
        "constants": constants[:10],
        "decorators_used": [],
    }


def extract_module_context(file_path: Path) -> Dict:
    """Extract comprehensive module context for AI analysis."""
    content = _get_file_content(file_path)  # Use cached content
    if not content:
        return {
            "content": "",
            "imports": [],
            "functions": [],
            "classes": [],
            "docstring": "",
            "summary": "",
            "content_preview": "",
            "constants": [],
            "decorators_used": [],
        }

    suffix = file_path.suffix.lower()
    if suffix in (".ts", ".tsx", ".js", ".mjs", ".cjs"):
        return extract_typescript_context(content)

    docstring = None
    tree = None

    try:
        tree = ast.parse(content)
        docstring = ast.get_docstring(tree) or ""
    except SyntaxError:
        tree = None
        docstring = ""

    imports = []
    import_details = []
    functions = []
    function_details = []
    classes = []
    class_details = []
    constants = []
    all_decorators = set()

    if tree:
        for node in ast.iter_child_nodes(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    imports.append(alias.name)
                    import_details.append(f"import {alias.name}")

            elif isinstance(node, ast.ImportFrom):
                if node.module:
                    imports.append(node.module)
                    names = [alias.name for alias in node.names[:5]]
                    if len(node.names) > 5:
                        names.append("...")
                    import_details.append(f"from {node.module} import {', '.join(names)}")

            elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                func_name = node.name
                func_doc = ast.get_docstring(node) or ""
                func_args = [arg.arg for arg in node.args.args[:5]]
                functions.append(func_name)

                # Get decorators
                decorators = _get_decorator_names(node)
                all_decorators.update(decorators)
                dec_prefix = f"@{decorators[0]} " if decorators else ""

                # Build signature with return type if available
                func_sig = f"{dec_prefix}{func_name}({', '.join(func_args)})"
                if func_doc:
                    # Take first sentence of docstring
                    first_sentence = func_doc.split('.')[0].strip()
                    func_sig += f" - {first_sentence[:200]}"
                function_details.append(func_sig)

            elif isinstance(node, ast.ClassDef):
                class_name = node.name
                class_doc = ast.get_docstring(node) or ""
                classes.append(class_name)

                # Get decorators and bases
                decorators = _get_decorator_names(node)
                all_decorators.update(decorators)
                bases = _get_base_classes(node)

                # Check for special class types
                is_dataclass = "dataclass" in decorators
                is_enum = any(b in ("Enum", "IntEnum", "StrEnum") for b in bases)

                # Get class methods (public + special)
                methods = []
                for item in node.body:
                    if isinstance(item, (ast.FunctionDef, ast.AsyncFunctionDef)):
                        if not item.name.startswith("_") or item.name in (
                            "__init__", "__call__", "__enter__", "__exit__",
                            "__iter__", "__next__", "__hash__", "__eq__",
                        ):
                            methods.append(item.name)

                # Build class info
                dec_prefix = f"@{decorators[0]} " if decorators else ""
                base_suffix = f"({', '.join(bases)})" if bases else ""
                class_info = f"{dec_prefix}class {class_name}{base_suffix}"

                # Add fields for dataclasses or enum values
                if is_dataclass:
                    fields = _extract_dataclass_fields(node)
                    if fields:
                        class_info += f" fields=[{', '.join(fields[:5])}]"
                elif is_enum:
                    values = _extract_enum_values(node)
                    if values:
                        class_info += f" values=[{', '.join(values[:5])}]"
                elif methods:
                    class_info += f" methods=[{', '.join(methods[:5])}]"

                # Add docstring summary
                if class_doc:
                    first_sentence = class_doc.split('.')[0].strip()
                    class_info += f" - {first_sentence[:200]}"
                class_details.append(class_info)

            elif isinstance(node, ast.Assign):
                # Extract module-level constants (UPPER_CASE names)
                for target in node.targets:
                    if isinstance(target, ast.Name) and target.id.isupper():
                        constants.append(target.id)

    # Build comprehensive summary
    summary_parts = []

    if docstring:
        # Include full module docstring (not truncated)
        summary_parts.append(f"MODULE DOCSTRING:\n{docstring}")

    if constants:
        summary_parts.append(f"CONSTANTS: {', '.join(constants[:15])}")

    if class_details:
        summary_parts.append(f"CLASSES ({len(class_details)}):\n" + "\n".join(f"  - {c}" for c in class_details[:8]))

    if function_details:
        summary_parts.append(f"FUNCTIONS ({len(function_details)}):\n" + "\n".join(f"  - {f}" for f in function_details[:8]))

    if import_details:
        # Group imports by source
        core_imports = [i for i in import_details if "core." in i]
        other_imports = [i for i in import_details if "core." not in i]
        if core_imports:
            summary_parts.append(f"STERLING IMPORTS: {', '.join(core_imports[:10])}")
        if other_imports:
            summary_parts.append(f"EXTERNAL IMPORTS: {', '.join(other_imports[:8])}")

    # Smart content preview - prioritize informative sections
    content_preview = _build_smart_preview(content, docstring)

    return {
        "docstring": docstring,
        "imports": imports,
        "import_details": import_details,
        "functions": functions,
        "function_details": function_details,
        "classes": classes,
        "class_details": class_details,
        "constants": constants,
        "decorators_used": list(all_decorators),
        "summary": "\n\n".join(summary_parts),
        "content_preview": content_preview,
    }


def _build_smart_preview(content: str, docstring: str) -> str:
    """Build a smart content preview that prioritizes informative sections."""
    lines = content.splitlines()
    preview_parts = []
    preview_budget = 3000  # chars

    # 1. Always include module docstring area (first 50 lines or until first class/def)
    header_end = 0
    for i, line in enumerate(lines[:50]):
        if line.startswith("class ") or line.startswith("def ") or line.startswith("async def "):
            header_end = i
            break
    else:
        header_end = min(50, len(lines))

    header = "\n".join(lines[:header_end])
    preview_parts.append(header)
    preview_budget -= len(header)

    # 2. Find and include key class definitions (first 20 lines of each major class)
    if preview_budget > 500:
        in_class = False
        class_start = 0
        class_lines_collected = 0

        for i, line in enumerate(lines[header_end:], start=header_end):
            if line.startswith("class ") and not line.startswith("class _"):
                in_class = True
                class_start = i
                class_lines_collected = 0
            elif in_class:
                class_lines_collected += 1
                if class_lines_collected >= 25 or (line.startswith("class ") or line.startswith("def ")):
                    # End of class section
                    class_section = "\n".join(lines[class_start:i])
                    if len(class_section) < preview_budget:
                        preview_parts.append(f"\n# ... class definition ...\n{class_section}")
                        preview_budget -= len(class_section)
                    in_class = False

            if preview_budget < 200:
                break

    return "\n".join(preview_parts)[:4000]  # Hard cap


# SafeLogitsProcessor for numerical stability during generation
if TRANSFORMERS_AVAILABLE and LogitsProcessor is not None:
    class SafeLogitsProcessor(LogitsProcessor):
        """Logits processor that clamps logits to prevent invalid probability distributions."""

        def __init__(self, min_logit: float = -50.0, max_logit: float = 50.0):
            self.min_logit = min_logit
            self.max_logit = max_logit

        def __call__(self, input_ids: torch.LongTensor, scores: torch.FloatTensor) -> torch.FloatTensor:
            """Clamp logits to prevent inf/nan values."""
            scores = torch.clamp(scores, min=self.min_logit, max=self.max_logit)
            scores = torch.where(torch.isfinite(scores), scores, torch.zeros_like(scores))
            return scores
else:
    SafeLogitsProcessor = None  # type: ignore


def _init_transformers_model(model_path: str = None) -> bool:
    """Initialize the transformers model for faster generation."""
    global _GLOBAL_MODEL, _GLOBAL_TOKENIZER, _GLOBAL_DEVICE

    if _GLOBAL_MODEL is not None:
        return True  # Already initialized

    if not TRANSFORMERS_AVAILABLE:
        return False

    # Use discovered path if not provided
    if model_path is None:
        model_path = DEFAULT_MODEL_PATH

    if not Path(model_path).exists():
        print(f"  Model not found at {model_path}")
        return False

    try:
        print(f"  Loading model from {model_path}...")

        # Determine device
        if torch.backends.mps.is_available():
            device = torch.device("mps")
            dtype = torch.float16
        elif torch.cuda.is_available():
            device = torch.device("cuda")
            dtype = torch.float16
        else:
            device = torch.device("cpu")
            dtype = torch.float32

        print(f"  Using device: {device}, dtype: {dtype}")

        _GLOBAL_TOKENIZER = AutoTokenizer.from_pretrained(model_path)
        _GLOBAL_MODEL = AutoModelForCausalLM.from_pretrained(
            model_path,
            torch_dtype=dtype,
        ).to(device)
        _GLOBAL_DEVICE = device

        print(f"  Model loaded successfully")
        return True

    except Exception as e:
        print(f"  Failed to load transformers model: {e}")
        return False


def _apply_chat_template(prompts: List[str], system_prompts: Optional[List[str]] = None) -> List[str]:
    """Apply chat template to prompts.

    Uses the tokenizer's chat template if available, otherwise falls back to
    a standard format compatible with Olmo.
    """
    global _GLOBAL_TOKENIZER

    formatted = []
    for i, prompt in enumerate(prompts):
        system = system_prompts[i] if system_prompts and i < len(system_prompts) else None

        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})

        if hasattr(_GLOBAL_TOKENIZER, 'apply_chat_template'):
            try:
                full_prompt = _GLOBAL_TOKENIZER.apply_chat_template(
                    messages,
                    tokenize=False,
                    add_generation_prompt=True
                )
            except Exception:
                # Fallback format for Olmo-style models
                if system:
                    full_prompt = f"<|im_start|>system\n{system}<|im_end|>\n<|im_start|>user\n{prompt}<|im_end|>\n<|im_start|>assistant\n"
                else:
                    full_prompt = f"<|im_start|>user\n{prompt}<|im_end|>\n<|im_start|>assistant\n"
        else:
            # Fallback format
            if system:
                full_prompt = f"<|im_start|>system\n{system}<|im_end|>\n<|im_start|>user\n{prompt}<|im_end|>\n<|im_start|>assistant\n"
            else:
                full_prompt = f"<|im_start|>user\n{prompt}<|im_end|>\n<|im_start|>assistant\n"

        formatted.append(full_prompt)
    return formatted


def _clear_gpu_cache():
    """Clear GPU cache to free memory."""
    if torch is not None:
        if torch.backends.mps.is_available():
            torch.mps.empty_cache()
        elif torch.cuda.is_available():
            torch.cuda.empty_cache()


def _generate_with_transformers(prompt: str, system_prompt: str, max_new_tokens: int = 256) -> Optional[str]:
    """Generate text using the loaded transformers model."""
    results = _generate_batch_with_transformers([(prompt, system_prompt)], max_new_tokens)
    return results[0] if results else None


def _generate_batch_with_transformers(
    prompt_pairs: List[Tuple[str, str]],  # List of (prompt, system_prompt)
    max_new_tokens: int = 256,
    batch_size: int = 4,
) -> List[Optional[str]]:
    """Generate text for multiple prompts in batches for efficiency.

    This method processes prompts in smaller batches to avoid OOM errors
    while still benefiting from batched inference.
    """
    global _GLOBAL_MODEL, _GLOBAL_TOKENIZER, _GLOBAL_DEVICE

    if _GLOBAL_MODEL is None or not prompt_pairs:
        return [None] * len(prompt_pairs)

    results = []

    # Process in batches
    for batch_start in range(0, len(prompt_pairs), batch_size):
        batch_end = min(batch_start + batch_size, len(prompt_pairs))
        batch = prompt_pairs[batch_start:batch_end]

        try:
            # Format all prompts using chat template
            prompts = [p[0] for p in batch]
            system_prompts = [p[1] for p in batch]
            full_prompts = _apply_chat_template(prompts, system_prompts)

            # Tokenize batch with padding
            inputs = _GLOBAL_TOKENIZER(
                full_prompts,
                return_tensors="pt",
                truncation=True,
                max_length=4096,
                padding=True,
            ).to(_GLOBAL_DEVICE)

            input_lengths = [
                (inputs.attention_mask[i] == 1).sum().item()
                for i in range(len(batch))
            ]

            # Create logits processor for numerical stability
            logits_processor = [SafeLogitsProcessor()] if SafeLogitsProcessor else None

            with torch.no_grad():
                try:
                    # Try sampling first with logits processor
                    generate_kwargs = {
                        "max_new_tokens": max_new_tokens,
                        "do_sample": True,
                        "temperature": 0.7,
                        "top_p": 0.9,
                        "pad_token_id": _GLOBAL_TOKENIZER.eos_token_id,
                    }
                    if logits_processor:
                        generate_kwargs["logits_processor"] = logits_processor

                    outputs = _GLOBAL_MODEL.generate(**inputs, **generate_kwargs)
                except RuntimeError as e:
                    error_msg = str(e).lower()
                    if "probability" in error_msg or "inf" in error_msg or "nan" in error_msg:
                        # Fallback to greedy decoding if sampling fails
                        print(f"  Warning: Sampling failed ({e}), falling back to greedy decoding")
                        outputs = _GLOBAL_MODEL.generate(
                            **inputs,
                            max_new_tokens=max_new_tokens,
                            do_sample=False,
                            pad_token_id=_GLOBAL_TOKENIZER.eos_token_id,
                        )
                    else:
                        raise

            # Decode each response
            for i, output in enumerate(outputs):
                response = _GLOBAL_TOKENIZER.decode(
                    output[input_lengths[i]:],
                    skip_special_tokens=True
                )
                results.append(response.strip())

            # Clear GPU memory periodically
            del inputs, outputs
            _clear_gpu_cache()

        except Exception as e:
            print(f"  Batch generation error: {e}")
            # Fall back to individual generation for this batch
            for prompt, system_prompt in batch:
                try:
                    result = _generate_single_with_transformers(prompt, system_prompt, max_new_tokens)
                    results.append(result)
                except Exception as inner_e:
                    print(f"  Single generation also failed: {inner_e}")
                    results.append(None)

    return results


def _generate_single_with_transformers(prompt: str, system_prompt: str, max_new_tokens: int = 256) -> Optional[str]:
    """Generate text for a single prompt (fallback for batch failures)."""
    global _GLOBAL_MODEL, _GLOBAL_TOKENIZER, _GLOBAL_DEVICE

    if _GLOBAL_MODEL is None:
        return None

    try:
        # Use the shared chat template function
        system_prompts_list = [system_prompt] if system_prompt else None
        full_prompts = _apply_chat_template([prompt], system_prompts_list)
        full_prompt = full_prompts[0]

        inputs = _GLOBAL_TOKENIZER(
            full_prompt,
            return_tensors="pt",
            truncation=True,
            max_length=4096,
        ).to(_GLOBAL_DEVICE)

        # Create logits processor for numerical stability
        logits_processor = [SafeLogitsProcessor()] if SafeLogitsProcessor else None

        with torch.no_grad():
            try:
                generate_kwargs = {
                    "max_new_tokens": max_new_tokens,
                    "do_sample": True,
                    "temperature": 0.7,
                    "top_p": 0.9,
                    "pad_token_id": _GLOBAL_TOKENIZER.eos_token_id,
                }
                if logits_processor:
                    generate_kwargs["logits_processor"] = logits_processor

                outputs = _GLOBAL_MODEL.generate(**inputs, **generate_kwargs)
            except RuntimeError as e:
                error_msg = str(e).lower()
                if "probability" in error_msg or "inf" in error_msg or "nan" in error_msg:
                    # Fallback to greedy decoding
                    outputs = _GLOBAL_MODEL.generate(
                        **inputs,
                        max_new_tokens=max_new_tokens,
                        do_sample=False,
                        pad_token_id=_GLOBAL_TOKENIZER.eos_token_id,
                    )
                else:
                    raise

        response = _GLOBAL_TOKENIZER.decode(
            outputs[0][inputs.input_ids.shape[1]:],
            skip_special_tokens=True
        )

        # Clean up
        del inputs, outputs
        _clear_gpu_cache()

        return response.strip()

    except Exception as e:
        print(f"  Single generation error: {e}")
        return None


def call_ollama(prompt: str, system_prompt: str, model: str = "llama3.2:latest", timeout: int = 180) -> Optional[str]:
    """Call ollama with specified model (fallback if transformers unavailable)."""
    try:
        result = subprocess.run(
            ["ollama", "run", model, "--nowordwrap"],
            input=f"{system_prompt}\n\n{prompt}",
            capture_output=True,
            text=True,
            timeout=timeout,
        )

        if result.returncode != 0:
            return None

        response = result.stdout.strip()
        return _parse_llm_response(response)

    except subprocess.TimeoutExpired:
        print("  Timeout calling ollama")
        return None
    except FileNotFoundError:
        print("  ollama not found - install with: brew install ollama")
        return None
    except Exception as e:
        print(f"  Error calling ollama: {e}")
        return None


def generate_text(prompt: str, system_prompt: str, use_transformers: bool = True, model: str = "llama3.2:latest") -> Optional[str]:
    """Generate text using the best available method."""
    # Try transformers first if available and requested
    if use_transformers and TRANSFORMERS_AVAILABLE:
        if _GLOBAL_MODEL is not None or _init_transformers_model():
            response = _generate_with_transformers(prompt, system_prompt)
            if response:
                return _parse_llm_response(response)

    # Fall back to ollama
    return call_ollama(prompt, system_prompt, model=model)


def _filter_meta_commentary(response: str) -> str:
    """Filter out thinking/meta-commentary from LLM responses.

    This removes common patterns where the LLM "thinks out loud" rather than
    providing the structured output we requested.
    """
    if not response:
        return response

    lines = response.split("\n")
    filtered_lines = []
    in_output_block = False

    # Patterns that indicate meta-commentary (not the actual content)
    skip_patterns = [
        "let me", "i'll", "i will", "thinking", "hmm", "okay so", "alright",
        "let's see", "i need to", "first,", "now,", "...done thinking",
        "putting it together", "final answer", "here is", "so the",
        "maybe", "that seems", "i think", "```", "---",
        "looking at", "based on", "the module", "the script", "the file",
        "this module", "let me generate", "generating",
    ]

    for line in lines:
        lower_line = line.lower().strip()

        # Skip obvious meta-commentary (unless we're in an output block)
        if any(p in lower_line for p in skip_patterns) and not in_output_block:
            continue

        # Track output blocks (preserve everything inside them)
        if line.strip().startswith("OUTPUT:"):
            in_output_block = True
        elif line.strip() and line.strip()[0].isupper() and ":" in line[:20]:
            in_output_block = False

        filtered_lines.append(line)

    return "\n".join(filtered_lines).strip()


def _parse_llm_response(response: str) -> Optional[str]:
    """Parse LLM response to extract the description.

    Uses multiple strategies to extract a clean description from LLM output,
    filtering meta-commentary first.
    """
    if not response:
        return None

    # Filter meta-commentary first
    response = _filter_meta_commentary(response)
    if not response:
        return None

    lines = response.split("\n")

    # Strategy 1: Find consecutive lines starting with action verbs (multi-sentence)
    description_lines = []
    collecting = False

    for line in lines:
        line_stripped = line.strip()
        if not line_stripped:
            if collecting:
                break  # End of description paragraph
            continue

        # Check if line starts with action verb
        starts_with_verb = any(line_stripped.startswith(verb) for verb in ACTION_VERBS)

        if starts_with_verb:
            collecting = True
            description_lines.append(line_stripped)
        elif collecting:
            # Continue collecting if it looks like a continuation
            if line_stripped[0].islower() or line_stripped.startswith("("):
                description_lines.append(line_stripped)
            else:
                break

    if description_lines:
        return " ".join(description_lines)

    # Strategy 2: Look for JSON-formatted response
    try:
        # Check if response is JSON
        if "{" in response and "}" in response:
            json_match = re.search(r'\{[^}]+\}', response, re.DOTALL)
            if json_match:
                data = json.loads(json_match.group())
                if "description" in data:
                    return data["description"]
    except (json.JSONDecodeError, KeyError):
        pass

    # Strategy 3: Take the longest substantial paragraph
    paragraphs = response.split("\n\n")
    best_paragraph = None
    best_score = 0

    for para in paragraphs:
        para = para.strip()
        if len(para) < 30 or len(para) > 800:
            continue

        # Score based on presence of action verbs and technical terms
        score = len(para)
        if any(para.startswith(verb) for verb in ACTION_VERBS):
            score += 200
        if any(term in para.lower() for term in ["implements", "provides", "defines", "handles"]):
            score += 100

        if score > best_score:
            best_score = score
            best_paragraph = para

    return best_paragraph


def _truncate_at_sentence(text: str, max_chars: int) -> str:
    """Truncate text at a sentence boundary, not mid-word."""
    if len(text) <= max_chars:
        return text

    # Find sentence boundaries
    sentence_ends = list(re.finditer(r'[.!?]\s+', text[:max_chars + 50]))

    if sentence_ends:
        # Find the last sentence end before max_chars
        for match in reversed(sentence_ends):
            if match.end() <= max_chars:
                return text[:match.end()].strip()

    # Fallback: truncate at word boundary
    truncated = text[:max_chars]
    last_space = truncated.rfind(' ')
    if last_space > max_chars * 0.7:
        return truncated[:last_space] + "..."

    return truncated + "..."


def _build_description_prompt(context: Dict, category: str, rel_path: str) -> Tuple[str, str]:
    """Build prompt and system prompt for description generation."""
    system_prompt = f"""You are a technical documentation writer for the conscious-bot project.

{PROJECT_CONTEXT}

YOUR TASK: Write a 1-3 sentence technical description of a TypeScript or Python module.

RULES:
1. Start with an action verb: Provides, Implements, Defines, Enforces, Manages, etc.
2. Be specific about what the module does in the conscious-bot architecture
3. Mention key classes/functions if they're central to the module's purpose
4. Refer to the project as "conscious-bot" or "the bot" - never "Sterling"
5. Output ONLY the description - no thinking, no preamble, no markdown
6. Keep it under 300 characters ideally, max 500 characters"""

    prompt = f"""Describe this module:

PATH: packages/{rel_path}
CATEGORY: {category}

{context["summary"]}

CODE PREVIEW:
{context["content_preview"][:2500]}

Write a 1-3 sentence description starting with an action verb:"""

    return prompt, system_prompt


def _clean_description_response(response: Optional[str], context: Dict) -> str:
    """Clean up a description response or fall back to docstring."""
    if response:
        response = response.strip()

        # Remove common preamble patterns
        for prefix in [
            "The module ", "This module ", "The file ", "This file ",
            "This Python module ", "The Python module ",
            "Here is the description: ", "Description: ",
        ]:
            if response.startswith(prefix):
                response = response[len(prefix):]
                if response:
                    response = response[0].upper() + response[1:]

        # Remove trailing quotes or periods if doubled
        response = response.strip('"\'')
        while response.endswith(".."):
            response = response[:-1]

        return _truncate_at_sentence(response, 500)

    # Fallback to docstring with smart truncation
    if context["docstring"]:
        return _truncate_at_sentence(context["docstring"], 400)

    # Ultimate fallback with more detail
    parts = []
    if context["classes"]:
        parts.append(f"Defines {', '.join(context['classes'][:3])}")
    if context["functions"]:
        public_funcs = [f for f in context["functions"] if not f.startswith("_")][:3]
        if public_funcs:
            parts.append(f"provides {', '.join(public_funcs)}")

    if parts:
        return " and ".join(parts) + "."

    return "Module implementation."


def generate_description(file_path: Path, context: Dict, category: str, rel_path: str, use_transformers: bool = True) -> str:
    """Generate AI description for a module."""
    prompt, system_prompt = _build_description_prompt(context, category, rel_path)
    response = generate_text(prompt, system_prompt, use_transformers=use_transformers)
    return _clean_description_response(response, context)


def generate_descriptions_batch(
    items: List[Tuple[Path, Dict, str, str]],  # (file_path, context, category, rel_path)
    batch_size: int = 4,
) -> List[str]:
    """Generate descriptions for multiple modules in batches."""
    global _GLOBAL_MODEL

    if not TRANSFORMERS_AVAILABLE or _GLOBAL_MODEL is None:
        # Fall back to sequential processing
        return [
            generate_description(fp, ctx, cat, rp, use_transformers=False)
            for fp, ctx, cat, rp in items
        ]

    # Build all prompts
    prompt_pairs = []
    contexts = []
    for file_path, context, category, rel_path in items:
        prompt, system_prompt = _build_description_prompt(context, category, rel_path)
        prompt_pairs.append((prompt, system_prompt))
        contexts.append(context)

    # Generate in batches
    responses = _generate_batch_with_transformers(prompt_pairs, batch_size=batch_size)

    # Clean up responses
    descriptions = []
    for response, context in zip(responses, contexts):
        parsed = _parse_llm_response(response) if response else None
        descriptions.append(_clean_description_response(parsed, context))

    return descriptions


def determine_status(file_path: Path, metadata: Dict, context: Dict = None) -> Dict:
    """Determine module status using shared staleness assessment.

    Returns dict with staleness_level, staleness_score, staleness_indicators,
    recommendation, archive_candidate, archive_reasons.
    """
    days_ago = metadata["modified_days_ago"]
    rel_path = str(file_path)

    # Get imports for dependency analysis
    imports = context.get("imports", []) if context else []

    # Get TODOs for density analysis
    todos = {}
    lines = metadata.get("lines", 0)

    # Use shared staleness assessment
    assessment = assess_staleness(
        path=rel_path,
        days_since_modification=days_ago,
        imports=imports,
        todos=todos,
        lines=lines,
        content_type="code",
        use_git=False,  # Skip git for performance in batch mode
    )

    return assessment.to_dict()


def _staleness_to_legacy_status(staleness_level: str) -> str:
    """Convert staleness level to legacy status string for backward compatibility."""
    mapping = {
        "active": "active",
        "current": "current",
        "stable": "stable",
        "review_needed": "stable",
        "potentially_stale": "stable",
        "likely_stale": "legacy_v7",
        "deprecated": "deprecated",
        "archived": "archived",
    }
    return mapping.get(staleness_level, "stable")


def get_category(file_path: Path, core_dir: Path) -> str:
    """Get category based on packages/ directory structure."""
    rel_path = file_path.relative_to(core_dir)
    parts = rel_path.parts

    if len(parts) >= 1:
        category_key = parts[0]
        if category_key in MODULE_CATEGORIES:
            return MODULE_CATEGORIES[category_key]

    if file_path.name in ("__init__.py", "index.ts", "index.tsx"):
        return "Package entry point"

    return "Module"


def analyze_module(file_path: Path, core_dir: Path, use_ai: bool = True, use_transformers: bool = True) -> Dict:
    """Analyze a single module."""
    rel_path = file_path.relative_to(core_dir)
    rel_path_str = str(rel_path)
    metadata = get_file_metadata(file_path)
    context = extract_module_context(file_path)
    category = get_category(file_path, core_dir)
    todos = scan_todos(file_path, base_path=core_dir.parent)

    # Get staleness assessment
    staleness = determine_status(file_path, metadata, context)
    status = _staleness_to_legacy_status(staleness.get("staleness_level", "stable"))

    # Generate description
    if use_ai and file_path.name not in ("__init__.py", "index.ts", "index.tsx"):
        description = generate_description(file_path, context, category, rel_path_str, use_transformers=use_transformers)
    else:
        # For __init__.py or non-AI mode, use docstring with smart truncation
        if context["docstring"]:
            description = _truncate_at_sentence(context["docstring"], 400)
        elif context["classes"]:
            description = f"Defines {', '.join(context['classes'][:3])}."
        elif context["functions"]:
            public_funcs = [f for f in context["functions"] if not f.startswith("_")][:3]
            description = f"Provides {', '.join(public_funcs)}." if public_funcs else ""
        else:
            description = ""

    return {
        "path": rel_path_str,
        "name": file_path.name,
        "category": category,
        "status": status,
        "description": description,
        "classes": context["classes"],
        "functions": context["functions"][:10],
        "imports": context["imports"][:10],
        "constants": context.get("constants", [])[:10],
        "decorators_used": context.get("decorators_used", []),
        "todos": todos,
        # Staleness assessment fields
        "staleness_level": staleness.get("staleness_level", "stable"),
        "staleness_score": staleness.get("staleness_score", 0.0),
        "staleness_indicators": staleness.get("staleness_indicators", []),
        "recommendation": staleness.get("recommendation", "Review"),
        "archive_candidate": staleness.get("archive_candidate", False),
        "archive_reasons": staleness.get("archive_reasons", []),
        "metadata": {
            "created": metadata["created"],
            "modified": metadata["modified"],
            "modified_days_ago": metadata["modified_days_ago"],
            "lines": metadata["lines"],
            "size_bytes": metadata["size"],
            "author": _extract_author(context.get("docstring", "")),
            "has_main": _has_main_block(file_path),
        },
    }


def _extract_author(docstring: str) -> Optional[str]:
    """Extract author from docstring if present."""
    if not docstring:
        return None
    match = re.search(r'@?[Aa]uthor:?\s*(@?\w+)', docstring)
    if match:
        return match.group(1)
    return None


def _has_main_block(file_path: Path) -> bool:
    """Check if file has a if __name__ == '__main__' block."""
    content = _get_file_content(file_path)  # Use cached content
    return 'if __name__' in content and '__main__' in content if content else False


def is_description_stale(existing_entry: Dict, file_mtime: datetime, moc_generated: datetime) -> Tuple[bool, str]:
    """
    Determine if an existing description is stale and needs regeneration.

    Returns (is_stale, reason).
    """
    description = existing_entry.get("description", "")

    # Check 1: No description or placeholder
    if not description or description == "Module implementation.":
        return True, "missing_description"

    # Check 2: Description is truncated (ends mid-word or has ellipsis issues)
    if description.endswith("...") and len(description) < 100:
        return True, "truncated_short"

    # Check 3: File modified after MOC was generated
    if file_mtime > moc_generated:
        return True, "file_modified"

    # Check 4: Description starts with bad patterns
    bad_starts = ["Module", "The ", "This ", "A ", "An "]
    if any(description.startswith(prefix) for prefix in bad_starts):
        return True, "bad_prefix"

    # Check 5: Description is suspiciously short for a substantial file
    lines = existing_entry.get("metadata", {}).get("lines", 0)
    if lines > 200 and len(description) < 80:
        return True, "too_short_for_size"

    return False, "current"


def clean_description(desc: str) -> str:
    """Clean description for display - take first paragraph or first 2 sentences."""
    if not desc:
        return ""

    # Remove newlines and extra whitespace
    desc = " ".join(desc.split())

    # Take first 2 sentences
    import re

    sentences = re.split(r"(?<=[.!?])\s+", desc)
    if len(sentences) >= 2:
        return " ".join(sentences[:2])

    return desc[:250] if len(desc) > 250 else desc


def generate_markdown(inventory: List[Dict], output_path: Path):
    """Generate markdown documentation."""
    now = datetime.now()

    lines = [
        "# Conscious-Bot Core Map of Content",
        "",
        "**Author**: @darianrosebrook",
        f"**Generated**: {now.strftime('%Y-%m-%d %H:%M:%S')}",
        "",
        "This document provides a comprehensive index of modules in `packages/`, organized by category.",
        "Each entry includes path, description, classes, functions, and staleness assessment.",
        "",
        "## Legend",
        "",
        "- **Staleness Levels**: `active` | `current` | `stable` | `review_needed` | `potentially_stale` | `likely_stale` | `deprecated` | `archived`",
        "- **Score**: 0.0 (fresh) to 1.0 (definitely stale)",
        "- Lines of code shown in parentheses",
        "",
        "---",
        "",
    ]

    # Group by category
    by_category: Dict[str, List[Dict]] = {}
    for item in inventory:
        cat = item["category"]
        if cat not in by_category:
            by_category[cat] = []
        by_category[cat].append(item)

    # Sort categories
    category_order = [
        "Core module",
        "Package initialization",
        "State Hierarchy (core/state_model.py)",
    ]

    sorted_categories = sorted(
        by_category.keys(),
        key=lambda x: (
            x not in category_order,
            category_order.index(x) if x in category_order else 999,
            x,
        ),
    )

    for category in sorted_categories:
        items = by_category[category]
        lines.append(f"## {category}")
        lines.append("")

        # Sort items by path
        items.sort(key=lambda x: x["path"])

        for item in items:
            if item["name"] in ("__init__.py", "index.ts", "index.tsx"):
                continue  # Skip entry point files in detailed listing

            lines.append(f"### {item['path']}")
            lines.append("")

            # Build status line with staleness info
            staleness_level = item.get("staleness_level", item["status"])
            staleness_score = item.get("staleness_score", 0.0)
            status_parts = [
                f"**Staleness**: `{staleness_level}` ({staleness_score:.2f})",
                f"**Lines**: {item['metadata']['lines']}",
                f"**Modified**: {item['metadata']['modified_days_ago']} days ago",
            ]
            if item.get("archive_candidate"):
                status_parts.append("**Archive Candidate**: Yes")
            lines.append(" | ".join(status_parts))
            lines.append("")

            # Show staleness indicators if any
            if item.get("staleness_indicators"):
                lines.append("**Staleness Indicators**:")
                for indicator in item["staleness_indicators"][:3]:
                    lines.append(f"  - {indicator}")
                lines.append("")

            if item["description"]:
                desc = clean_description(item["description"])
                lines.append(f"**Description**: {desc}")
                lines.append("")

            if item["classes"]:
                classes_str = ", ".join(f"`{c}`" for c in item["classes"][:5])
                if len(item["classes"]) > 5:
                    classes_str += f" (+{len(item['classes']) - 5} more)"
                lines.append(f"**Classes**: {classes_str}")
                lines.append("")

            if item["functions"]:
                # Filter out private functions
                public_funcs = [f for f in item["functions"] if not f.startswith("_")][:5]
                if public_funcs:
                    funcs_str = ", ".join(f"`{f}`" for f in public_funcs)
                    lines.append(f"**Key Functions**: {funcs_str}")
                    lines.append("")

            lines.append("---")
            lines.append("")

    # Summary
    lines.append("## Summary Statistics")
    lines.append("")
    lines.append(f"- **Total Modules**: {len(inventory)}")

    # Staleness level counts (new)
    staleness_counts = {}
    for item in inventory:
        s = item.get("staleness_level", "stable")
        staleness_counts[s] = staleness_counts.get(s, 0) + 1

    lines.append("")
    lines.append("### By Staleness Level")
    lines.append("")
    staleness_order = ["active", "current", "stable", "review_needed", "potentially_stale", "likely_stale", "deprecated", "archived"]
    for level in staleness_order:
        if level in staleness_counts:
            lines.append(f"- **{level}**: {staleness_counts[level]}")

    # Archive candidates
    archive_candidates = [item for item in inventory if item.get("archive_candidate")]
    if archive_candidates:
        lines.append("")
        lines.append(f"### Archive Candidates ({len(archive_candidates)} modules)")
        lines.append("")
        for item in archive_candidates[:10]:
            reasons = ", ".join(item.get("archive_reasons", [])[:2])
            lines.append(f"- `{item['path']}` - {reasons}")
        if len(archive_candidates) > 10:
            lines.append(f"- ... and {len(archive_candidates) - 10} more")

    # Legacy status counts (for backward compatibility)
    status_counts = {}
    for item in inventory:
        s = item["status"]
        status_counts[s] = status_counts.get(s, 0) + 1

    lines.append("")
    lines.append("### By Legacy Status")
    lines.append("")
    for status, count in sorted(status_counts.items()):
        lines.append(f"- **{status.title()}**: {count}")

    total_lines = sum(item["metadata"]["lines"] for item in inventory)
    lines.append(f"- **Total Lines of Code**: {total_lines:,}")
    
    # TODO priority breakdown
    lines.append("")
    lines.append("### TODO Priority Breakdown")
    lines.append("")
    
    todo_counts = {
        "P0-GOV": 0,
        "P1-METRIC": 0,
        "P2-QUAL": 0,
        "P3-UX": 0,
        "untagged": 0
    }
    
    for item in inventory:
        todos = item.get("todos", {})
        for priority in todo_counts.keys():
            todo_counts[priority] += len(todos.get(priority, []))
    
    priority_labels = {
        "P0-GOV": "P0-GOV (Stop-the-line governance blockers)",
        "P1-METRIC": "P1-METRIC (Critical for Stage K/K1 signal discriminativity)",
        "P2-QUAL": "P2-QUAL (Correctness/quality improvements)",
        "P3-UX": "P3-UX (Backlog items - ergonomics, features)",
        "untagged": "Untagged TODOs"
    }
    
    for priority in ["P0-GOV", "P1-METRIC", "P2-QUAL", "P3-UX", "untagged"]:
        count = todo_counts[priority]
        if count > 0:
            lines.append(f"- **{priority_labels[priority]}**: {count}")
    
    total_todos = sum(todo_counts.values())
    if total_todos > 0:
        lines.append(f"- **Total TODOs**: {total_todos}")

    output_path.write_text("\n".join(lines), encoding="utf-8")
    print(f"Generated: {output_path}")


def generate_json(inventory: List[Dict], output_path: Path):
    """Generate JSON inventory."""
    now = datetime.now()

    output = {
        "generated": now.isoformat(),
        "author": "@darianrosebrook",
        "total_modules": len(inventory),
        "modules": inventory,
        "categories": {},
        "statistics": {},
    }

    # Build category index
    for item in inventory:
        cat = item["category"]
        if cat not in output["categories"]:
            output["categories"][cat] = []
        output["categories"][cat].append(item["path"])

    # Statistics
    status_counts = {}
    for item in inventory:
        s = item["status"]
        status_counts[s] = status_counts.get(s, 0) + 1

    # TODO priority breakdown
    todo_counts = {
        "P0-GOV": 0,
        "P1-METRIC": 0,
        "P2-QUAL": 0,
        "P3-UX": 0,
        "untagged": 0
    }

    for item in inventory:
        todos = item.get("todos", {})
        for priority in todo_counts.keys():
            todo_counts[priority] += len(todos.get(priority, []))

    # Safely compute statistics
    total_lines = 0
    total_classes = 0
    total_functions = 0

    for item in inventory:
        metadata = item.get("metadata", {})
        total_lines += metadata.get("lines", 0) or 0
        total_classes += len(item.get("classes", []))
        total_functions += len(item.get("functions", []))

    output["statistics"] = {
        "by_status": status_counts,
        "by_category": {cat: len(paths) for cat, paths in output["categories"].items()},
        "total_lines": total_lines,
        "total_classes": total_classes,
        "total_functions": total_functions,
        "todos_by_priority": todo_counts,
        "total_todos": sum(todo_counts.values()),
    }

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2)

    print(f"Generated: {output_path}")


def generate_csv(inventory: List[Dict], output_path: Path):
    """Generate CSV inventory for spreadsheet import."""
    import csv

    fieldnames = [
        "path", "name", "category", "status", "description",
        "classes", "functions", "lines", "size_bytes",
        "modified", "author", "todo_count"
    ]

    with open(output_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()

        for item in inventory:
            metadata = item.get("metadata", {})
            todos = item.get("todos", {})
            todo_count = sum(len(todos.get(p, [])) for p in todos)

            row = {
                "path": item.get("path", ""),
                "name": item.get("name", ""),
                "category": item.get("category", ""),
                "status": item.get("status", ""),
                "description": item.get("description", ""),
                "classes": ", ".join(item.get("classes", [])[:5]),
                "functions": ", ".join(item.get("functions", [])[:5]),
                "lines": metadata.get("lines", 0),
                "size_bytes": metadata.get("size_bytes", 0),
                "modified": metadata.get("modified", ""),
                "author": metadata.get("author", ""),
                "todo_count": todo_count,
            }
            writer.writerow(row)

    print(f"Generated: {output_path}")


def _extract_context_parallel(
    files_to_process: List[Tuple[Path, str]],  # (file_path, rel_path)
    core_dir: Path,
    max_workers: int = 4,
) -> Dict[str, Dict]:
    """Extract context for multiple files in parallel."""
    results = {}

    def process_file(args):
        file_path, rel_path = args
        try:
            # Pre-cache file content
            _get_file_content(file_path)
            metadata = get_file_metadata(file_path)
            context = extract_module_context(file_path)
            category = get_category(file_path, core_dir)
            todos = scan_todos(file_path, base_path=core_dir.parent)

            # Get staleness assessment
            staleness = determine_status(file_path, metadata, context)
            status = _staleness_to_legacy_status(staleness.get("staleness_level", "stable"))

            return rel_path, {
                "metadata": metadata,
                "context": context,
                "category": category,
                "status": status,
                "staleness": staleness,
                "todos": todos,
                "file_path": file_path,
            }
        except Exception as e:
            return rel_path, {"error": str(e)}

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {executor.submit(process_file, args): args for args in files_to_process}
        for future in as_completed(futures):
            rel_path, data = future.result()
            results[rel_path] = data

    return results


def main():
    import argparse

    # Register signal handler for graceful shutdown
    signal.signal(signal.SIGINT, _signal_handler)
    signal.signal(signal.SIGTERM, _signal_handler)

    parser = argparse.ArgumentParser(description="Generate core module inventory")
    parser.add_argument("--dry-run", action="store_true", help="Process only first 5 files")
    parser.add_argument("--no-ai", action="store_true", help="Skip AI descriptions")
    parser.add_argument("--limit", type=int, help="Limit number of files to process")
    parser.add_argument("--resume", action="store_true", help="Resume from existing JSON, regenerate stale entries")
    parser.add_argument("--force", action="store_true", help="Force regeneration of all descriptions")
    parser.add_argument("--model", type=str, default="llama3.2:latest", help="Ollama model to use")
    parser.add_argument("--use-ollama", action="store_true", help="Force use of ollama instead of transformers")
    parser.add_argument("--model-path", type=str, help="Path to local transformers model")
    parser.add_argument("--source-dir", type=str, default="packages", help="Source directory to scan (default: packages)")
    parser.add_argument("--output-dir", type=str, help="Output directory (default: docs/MOC)")
    parser.add_argument("--batch-size", type=int, default=4, help="Batch size for LLM generation")
    parser.add_argument("--workers", type=int, default=4, help="Number of parallel workers for context extraction")
    parser.add_argument("--save-interval", type=int, default=50, help="Save progress every N files")
    args = parser.parse_args()

    # Paths - navigate from scripts/utils to project root
    project_root = Path(__file__).resolve().parent.parent.parent
    core_dir = project_root / args.source_dir

    # Output directory
    if args.output_dir:
        output_dir = Path(args.output_dir)
    else:
        output_dir = project_root / "docs" / "MOC"

    output_dir.mkdir(parents=True, exist_ok=True)

    md_output = output_dir / "CORE_MAP_OF_CONTENT.md"
    json_output = output_dir / "CORE_MAP_OF_CONTENT.json"
    csv_output = output_dir / "CORE_MAP_OF_CONTENT.csv"

    # Find TypeScript and Python files
    py_files = []
    for ext in ("*.py", "*.ts", "*.tsx"):
        py_files.extend(core_dir.rglob(ext))
    py_files = sorted(set(py_files))

    def _should_exclude(f: Path) -> bool:
        s = str(f)
        name = f.name.lower()
        if "__pycache__" in s or "node_modules" in s:
            return True
        if "/dist/" in s or "\\dist\\" in s:
            return True
        if name.endswith(".d.ts"):
            return True
        if "__tests__" in s or "/tests/" in s or "\\tests\\" in s:
            return True
        if name.endswith(".test.ts") or name.endswith(".test.tsx"):
            return True
        if name.endswith(".spec.ts") or name.endswith(".spec.tsx"):
            return True
        if name.startswith("test_") and name.endswith(".py"):
            return True
        if name.endswith("_test.py"):
            return True
        return False

    py_files = [f for f in py_files if not _should_exclude(f)]

    print(f"Found {len(py_files)} files in {args.source_dir}/")

    # Apply limits
    if args.dry_run:
        py_files = py_files[:5]
        print(f"Dry run: processing {len(py_files)} files")
    elif args.limit:
        py_files = py_files[: args.limit]
        print(f"Limited to {len(py_files)} files")

    # Load existing inventory for resume
    existing = {}
    moc_generated = None
    if args.resume and json_output.exists() and not args.force:
        try:
            with open(json_output) as f:
                data = json.load(f)
                moc_generated = datetime.fromisoformat(data.get("generated", "2000-01-01"))
                for item in data.get("modules", []):
                    existing[item["path"]] = item
            print(f"Loaded {len(existing)} existing entries (generated: {moc_generated.strftime('%Y-%m-%d %H:%M')})")
        except Exception as e:
            print(f"Could not load existing JSON: {e}")
            moc_generated = datetime.min

    if moc_generated is None:
        moc_generated = datetime.min

    # Categorize files: reuse vs needs processing
    use_ai = not args.no_ai
    use_transformers = not args.use_ollama
    stats = {"reused": 0, "regenerated": 0, "new": 0, "errors": 0}

    inventory = []
    files_needing_ai = []  # (file_path, rel_path, context_data)
    files_to_extract = []  # (file_path, rel_path)

    # Register global state for graceful shutdown
    _INVENTORY_STATE["inventory"] = inventory
    _INVENTORY_STATE["json_output"] = json_output

    print("\nPhase 1: Checking staleness...")
    for file_path in py_files:
        rel_path = str(file_path.relative_to(core_dir))
        file_mtime = datetime.fromtimestamp(file_path.stat().st_mtime)

        if rel_path in existing and not args.force:
            existing_entry = existing[rel_path]
            is_stale, reason = is_description_stale(existing_entry, file_mtime, moc_generated)

            if not is_stale:
                inventory.append(existing_entry)
                stats["reused"] += 1
                continue
            else:
                stats["regenerated"] += 1
        else:
            stats["new"] += 1

        files_to_extract.append((file_path, rel_path))

    print(f"  ✓ Reusing {stats['reused']} existing entries")
    print(f"  ↻ Need to process {len(files_to_extract)} files")

    if not files_to_extract:
        print("\nNo files need processing.")
    else:
        # Phase 2: Extract context in parallel
        print(f"\nPhase 2: Extracting context ({args.workers} workers)...")
        context_data = _extract_context_parallel(files_to_extract, core_dir, max_workers=args.workers)
        print(f"  Extracted context for {len(context_data)} files")

        # Clear file cache to free memory
        _clear_file_cache()
        gc.collect()

        # Phase 3: Initialize LLM if needed
        if use_ai and use_transformers and TRANSFORMERS_AVAILABLE:
            model_path = args.model_path if args.model_path else None
            if _init_transformers_model(model_path):
                print(f"\nPhase 3: Generating descriptions (batch_size={args.batch_size})...")
            else:
                print("Falling back to ollama")
                use_transformers = False
        elif use_ai and not TRANSFORMERS_AVAILABLE:
            print("transformers not available, using ollama")
            use_transformers = False

        # Separate entry point files (no AI needed) from others
        init_files = []
        ai_needed_files = []

        for file_path, rel_path in files_to_extract:
            data = context_data.get(rel_path, {})
            if "error" in data:
                stats["errors"] += 1
                inventory.append({
                    "path": rel_path,
                    "name": file_path.name,
                    "category": "Unknown",
                    "status": "error",
                    "description": f"Error analyzing: {data['error']}",
                    "classes": [],
                    "functions": [],
                    "imports": [],
                    "constants": [],
                    "decorators_used": [],
                    "todos": {"P0-GOV": [], "P1-METRIC": [], "P2-QUAL": [], "P3-UX": [], "untagged": []},
                    "metadata": {},
                })
            elif file_path.name in ("__init__.py", "index.ts", "index.tsx") or not use_ai:
                # No AI needed for entry points
                init_files.append((file_path, rel_path, data))
            else:
                ai_needed_files.append((file_path, rel_path, data))

        # Process entry point files (no AI)
        for file_path, rel_path, data in init_files:
            context = data["context"]
            if context["docstring"]:
                description = _truncate_at_sentence(context["docstring"], 400)
            elif context["classes"]:
                description = f"Defines {', '.join(context['classes'][:3])}."
            elif context["functions"]:
                public_funcs = [f for f in context["functions"] if not f.startswith("_")][:3]
                description = f"Provides {', '.join(public_funcs)}." if public_funcs else ""
            else:
                description = ""

            staleness = data.get("staleness", {})
            entry = {
                "path": rel_path,
                "name": file_path.name,
                "category": data["category"],
                "status": data["status"],
                "description": description,
                "classes": context["classes"],
                "functions": context["functions"][:10],
                "imports": context["imports"][:10],
                "constants": context.get("constants", [])[:10],
                "decorators_used": context.get("decorators_used", []),
                "todos": data["todos"],
                # Staleness assessment fields
                "staleness_level": staleness.get("staleness_level", "stable"),
                "staleness_score": staleness.get("staleness_score", 0.0),
                "staleness_indicators": staleness.get("staleness_indicators", []),
                "recommendation": staleness.get("recommendation", "Review"),
                "archive_candidate": staleness.get("archive_candidate", False),
                "archive_reasons": staleness.get("archive_reasons", []),
                "metadata": {
                    "created": data["metadata"]["created"],
                    "modified": data["metadata"]["modified"],
                    "modified_days_ago": data["metadata"]["modified_days_ago"],
                    "lines": data["metadata"]["lines"],
                    "size_bytes": data["metadata"]["size"],
                    "author": _extract_author(context.get("docstring", "")),
                    "has_main": _has_main_block(file_path),
                },
            }
            inventory.append(entry)

        # Process files needing AI in batches
        if ai_needed_files and use_ai:
            if use_transformers and TRANSFORMERS_AVAILABLE and _GLOBAL_MODEL is not None:
                # Batch processing with transformers
                total_ai_files = len(ai_needed_files)
                print(f"  Processing {total_ai_files} files in batches of {args.batch_size}...")

                # Process in smaller batches with progress logging
                processed_count = 0
                for batch_start in range(0, total_ai_files, args.batch_size):
                    # Check for shutdown request
                    if _SHUTDOWN_REQUESTED:
                        print("\n  Stopping due to shutdown request...")
                        break

                    batch_end = min(batch_start + args.batch_size, total_ai_files)
                    batch = ai_needed_files[batch_start:batch_end]

                    # Show batch progress
                    print(f"  [{batch_start + 1}-{batch_end}/{total_ai_files}] Generating descriptions...")

                    # Prepare batch items
                    batch_items = [
                        (data["file_path"], data["context"], data["category"], rel_path)
                        for file_path, rel_path, data in batch
                    ]

                    # Generate descriptions for this batch
                    descriptions = generate_descriptions_batch(batch_items, batch_size=args.batch_size)

                    # Build entries for this batch
                    for (file_path, rel_path, data), description in zip(batch, descriptions):
                        context = data["context"]
                        staleness = data.get("staleness", {})
                        entry = {
                            "path": rel_path,
                            "name": file_path.name,
                            "category": data["category"],
                            "status": data["status"],
                            "description": description,
                            "classes": context["classes"],
                            "functions": context["functions"][:10],
                            "imports": context["imports"][:10],
                            "constants": context.get("constants", [])[:10],
                            "decorators_used": context.get("decorators_used", []),
                            "todos": data["todos"],
                            # Staleness assessment fields
                            "staleness_level": staleness.get("staleness_level", "stable"),
                            "staleness_score": staleness.get("staleness_score", 0.0),
                            "staleness_indicators": staleness.get("staleness_indicators", []),
                            "recommendation": staleness.get("recommendation", "Review"),
                            "archive_candidate": staleness.get("archive_candidate", False),
                            "archive_reasons": staleness.get("archive_reasons", []),
                            "metadata": {
                                "created": data["metadata"]["created"],
                                "modified": data["metadata"]["modified"],
                                "modified_days_ago": data["metadata"]["modified_days_ago"],
                                "lines": data["metadata"]["lines"],
                                "size_bytes": data["metadata"]["size"],
                                "author": _extract_author(context.get("docstring", "")),
                                "has_main": _has_main_block(file_path),
                            },
                        }
                        inventory.append(entry)
                        processed_count += 1
                        print(f"    ✓ {rel_path}")

                    # Progressive save after each batch
                    print(f"  [Checkpoint: {len(inventory)} entries, saving...]")
                    generate_json(inventory, json_output)
            else:
                # Sequential processing with ollama or fallback
                total_ai_files = len(ai_needed_files)
                for i, (file_path, rel_path, data) in enumerate(ai_needed_files, 1):
                    print(f"  [{i}/{total_ai_files}] {rel_path}...", end=" ", flush=True)
                    context = data["context"]
                    description = generate_description(
                        file_path, context, data["category"], rel_path,
                        use_transformers=False
                    )
                    staleness = data.get("staleness", {})
                    entry = {
                        "path": rel_path,
                        "name": file_path.name,
                        "category": data["category"],
                        "status": data["status"],
                        "description": description,
                        "classes": context["classes"],
                        "functions": context["functions"][:10],
                        "imports": context["imports"][:10],
                        "constants": context.get("constants", [])[:10],
                        "decorators_used": context.get("decorators_used", []),
                        "todos": data["todos"],
                        # Staleness assessment fields
                        "staleness_level": staleness.get("staleness_level", "stable"),
                        "staleness_score": staleness.get("staleness_score", 0.0),
                        "staleness_indicators": staleness.get("staleness_indicators", []),
                        "recommendation": staleness.get("recommendation", "Review"),
                        "archive_candidate": staleness.get("archive_candidate", False),
                        "archive_reasons": staleness.get("archive_reasons", []),
                        "metadata": {
                            "created": data["metadata"]["created"],
                            "modified": data["metadata"]["modified"],
                            "modified_days_ago": data["metadata"]["modified_days_ago"],
                            "lines": data["metadata"]["lines"],
                            "size_bytes": data["metadata"]["size"],
                            "author": _extract_author(context.get("docstring", "")),
                            "has_main": _has_main_block(file_path),
                        },
                    }
                    inventory.append(entry)
                    print("✓")

                    # Progressive save every N files
                    if i % args.save_interval == 0:
                        print(f"  [Checkpoint: {len(inventory)} entries saved]")
                        generate_json(inventory, json_output)

    # Sort inventory by path for consistent output
    inventory.sort(key=lambda x: x["path"])

    # Generate outputs
    print("\nPhase 4: Generating outputs...")
    generate_json(inventory, json_output)
    generate_markdown(inventory, md_output)
    generate_csv(inventory, csv_output)

    # Print summary
    print(f"\n{'='*50}")
    print(f"Complete! Processed {len(inventory)} modules.")
    print(f"  ✓ Reused:      {stats['reused']}")
    print(f"  ↻ Regenerated: {stats['regenerated']}")
    print(f"  + New:         {stats['new']}")
    if stats["errors"]:
        print(f"  ✗ Errors:      {stats['errors']}")
    print(f"\nOutputs:")
    print(f"  - {json_output}")
    print(f"  - {md_output}")
    print(f"  - {csv_output}")


if __name__ == "__main__":
    main()
