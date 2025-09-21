# HRM Integration (Custom Overrides)

**Author:** @darianrosebrook
**Purpose:** Python bridge for integrating Sapient HRM with the conscious bot TypeScript system
**Location:** Custom overrides from the original Sapient-HRM project
**Original Source:** External Sapient-HRM repository (not ours)

## Overview

This directory contains **our custom overrides** to the external Sapient-HRM project. These files represent the modifications and integrations we've made to bridge the Python-based Sapient HRM with our TypeScript-based conscious bot architecture.

## Structure

```
external-integrations/hrm/
├── hrm_bridge.py          # Main Flask server with our custom integrations
├── test_hrm_basic.py      # Our test suite for the integration
├── requirements.txt       # Python dependencies we need
├── models/                # Custom HRM model implementations
│   ├── hrm_act_v1.py      # Our version of the hierarchical reasoning model
│   ├── layers.py          # Custom layer implementations
│   ├── common.py          # Shared utilities and configurations
│   └── sparse_embedding.py# Custom sparse embedding layers
└── README.md             # This file
```

## Important Notes

- **This is NOT the original Sapient-HRM project** - that's maintained elsewhere
- **These files contain our custom modifications** for conscious bot integration
- **We track these overrides in our Git repository** to maintain our customizations
- **The original project may have newer versions** - check for updates periodically

## Integration Points

This bridge integrates with our TypeScript system at:
- `packages/core/src/mcp-capabilities/hybrid-hrm-integration.ts` - Main integration point
- Various cognitive processing modules that use HRM for structured reasoning

## Files

### `hrm_bridge.py`
The main Flask server that bridges the Python-based Sapient HRM with our TypeScript system. This provides:
- REST API endpoints for HRM inference
- Mock HRM implementation for testing without FlashAttention
- Health check and status endpoints
- Integration with the conscious bot's hybrid cognitive architecture

### `test_hrm_basic.py`
Basic test suite for the HRM bridge functionality, including:
- Health check tests
- Mock HRM inference tests
- Integration validation tests

### `requirements.txt`
Python dependencies required for the HRM bridge:
- Flask (web server)
- torch (PyTorch for HRM)
- flash_attn (optional, for full HRM functionality)

### `models/` Directory
Contains our custom implementations of the HRM model architecture:
- `hrm_act_v1.py` - Our version of the hierarchical reasoning model
- `layers.py` - Custom layer implementations
- `common.py` - Shared utilities and configurations
- `sparse_embedding.py` - Custom sparse embedding layers

## Usage

### Starting the HRM Bridge Server
```bash
cd external-integrations/hrm
python hrm_bridge.py
```

The server will start on port 5000 and provide the following endpoints:
- `GET /health` - Health check
- `POST /initialize` - Initialize HRM model
- `POST /infer` - Run HRM inference
- `GET /status` - Get server status

### Integration with TypeScript
The TypeScript system connects to this bridge via the `HybridHRMRouter` in `packages/core/src/mcp-capabilities/hybrid-hrm-integration.ts`.

## Development

### Testing
```bash
cd external-integrations/hrm
python test_hrm_basic.py
```

### Dependencies
Install the required Python packages:
```bash
pip install -r requirements.txt
```

## Architecture

This bridge is part of the hybrid cognitive architecture that combines:
1. **Python HRM**: Sapient HRM for structured reasoning
2. **TypeScript LLM**: Ollama integration for flexible reasoning
3. **GOAP**: Goal-Oriented Action Planning for reactive responses

The bridge enables seamless communication between these different reasoning systems within the conscious bot architecture.
