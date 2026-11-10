"""Shrink a rembg ONNX model ~4x with 8-bit weights (used by CI for the IS-Net models).
Usage: python scripts/quantize-model.py in.onnx out.onnx"""
import sys
from onnxruntime.quantization import quantize_dynamic, QuantType

quantize_dynamic(sys.argv[1], sys.argv[2], weight_type=QuantType.QUInt8, op_types_to_quantize=["Conv"])
print("wrote", sys.argv[2])
