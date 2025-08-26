#!/usr/bin/env python3
"""
Basic test script to validate HRM environment setup without full training dependencies.
"""

import sys
import torch
import numpy as np
from pathlib import Path

def test_basic_imports():
    """Test basic imports work correctly."""
    print("Testing basic imports...")
    
    try:
        import torch
        print(f"✅ PyTorch: {torch.__version__}")
        
        import numpy as np
        print(f"✅ NumPy: {np.__version__}")
        
        import einops
        print(f"✅ Einops: {einops.__version__}")
        
        return True
    except ImportError as e:
        print(f"❌ Import failed: {e}")
        return False

def test_model_loading():
    """Test loading HRM model architecture."""
    print("\nTesting HRM model architecture...")
    
    try:
        # Add the models directory to path
        sys.path.append(str(Path(__file__).parent / "models"))
        
        from hrm.hrm_act_v1 import HierarchicalReasoningModel_ACTV1
        from common import ModelConfig
        
        # Create a simple config for testing
        config = ModelConfig(
            vocab_size=512,
            n_embd=128,
            n_head=8,
            n_layer=4,
            hrm_n_layer=2,
            block_size=256,
            bias=False,
            dropout=0.0,
        )
        
        # Create model
        model = HierarchicalReasoningModel_ACTV1(config)
        print(f"✅ HRM model created with {sum(p.numel() for p in model.parameters())} parameters")
        
        # Test forward pass with dummy data
        dummy_input = torch.randint(0, config.vocab_size, (1, 32))
        with torch.no_grad():
            output = model(dummy_input)
        print(f"✅ Forward pass successful, output shape: {output.logits.shape}")
        
        return True
    except Exception as e:
        print(f"❌ Model test failed: {e}")
        return False

def test_torch_features():
    """Test PyTorch features we need."""
    print("\nTesting PyTorch features...")
    
    try:
        # Test basic tensor operations
        x = torch.randn(4, 4)
        y = torch.mm(x, x.T)
        print(f"✅ Basic tensor operations work")
        
        # Test device availability
        if torch.backends.mps.is_available():
            device = torch.device("mps")
            print(f"✅ MPS (Apple Silicon GPU) available")
        else:
            device = torch.device("cpu")
            print(f"✅ Using CPU device")
        
        # Test moving tensor to device
        z = x.to(device)
        print(f"✅ Tensor moved to {device}")
        
        return True
    except Exception as e:
        print(f"❌ PyTorch test failed: {e}")
        return False

def main():
    """Run all tests."""
    print("🔥 HRM Environment Validation")
    print("=" * 40)
    
    success = True
    success &= test_basic_imports()
    success &= test_torch_features()
    success &= test_model_loading()
    
    print("\n" + "=" * 40)
    if success:
        print("🎉 All tests passed! HRM environment is ready.")
        return 0
    else:
        print("❌ Some tests failed. Check the output above.")
        return 1

if __name__ == "__main__":
    exit(main())
