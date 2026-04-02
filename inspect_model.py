import tensorflow as tf
from tensorflow.keras.models import load_model
import json
import codecs

with codecs.open("model_info_utf8.txt", "w", encoding="utf-8") as f:
    try:
        model = load_model('leaf_classifier_v2.h5', compile=False)
        f.write("--- Model Input Shape ---\n")
        f.write(str(model.input_shape) + "\n")
        
        f.write("--- Model Output Shape ---\n")
        f.write(str(model.output_shape) + "\n")
        
        f.write("--- First Layer ---\n")
        f.write(str(model.layers[0].get_config()) + "\n")
        
        f.write("--- Last Layer ---\n")
        f.write(str(model.layers[-1].get_config()) + "\n")

    except Exception as e:
        f.write(f"Error: {e}\n")
