# HRM Integration Package

**Author:** @darianrosebrook  
**Purpose:** Python bridge for integrating Sapient HRM with the conscious bot TypeScript system

## Overview

This package contains the Python bridge components that enable integration between the Sapient HRM (Hierarchical Reasoning Model) and our conscious bot's TypeScript-based cognitive architecture.

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

## Usage

### Starting the HRM Bridge Server
```bash
cd packages/hrm-integration
python hrm_bridge.py
```

The server will start on port 5001 and provide the following endpoints:
- `GET /health` - Health check
- `POST /initialize` - Initialize HRM model
- `POST /infer` - Run HRM inference
- `GET /status` - Get server status

### Integration with TypeScript
The TypeScript system connects to this bridge via the `HybridHRMRouter` in `packages/core/src/mcp-capabilities/hybrid-hrm-integration.ts`.

## Development

### Testing
```bash
cd packages/hrm-integration
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
