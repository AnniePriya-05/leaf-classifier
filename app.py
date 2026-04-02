import os
import json
import numpy as np
from flask import Flask, request, jsonify
from flask_cors import CORS
from PIL import Image
from werkzeug.utils import secure_filename

# Optional: Disable TF oneDNN warnings for cleaner logs
os.environ['TF_ENABLE_ONEDNN_OPTS'] = '0'

import tensorflow as tf
from tensorflow.keras.models import load_model
from tensorflow.keras.preprocessing.image import img_to_array

app = Flask(__name__)
# Enable CORS for all domains so Vercel can talk to Render
CORS(app)

app.config['UPLOAD_FOLDER'] = 'uploads'
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024 # 16 MB max

# Ensure upload directory exists
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

# Define generic classes, solutions and tamil translations
# We'll map the index from the generic output
LEAF_CLASSES = [
    {
        "class": "Healthy",
        "disease_name": "None",
        "solution": "Maintain optimal watering, adequate sunlight, and regular fertilization.",
        "disease_name_tamil": "இல்லை",
        "solution_tamil": "சரியான நேரத்தில் நீர்ப்பாசனம், போதுமான சூரிய ஒளி மற்றும் வழக்கமான உரமிடுதல் ஆகியவற்றை பராமரிக்கவும்."
    },
    {
        "class": "Diseased - Leaf Bite",
        "disease_name": "Leaf Bite (Pest)",
        "solution": "Apply neem oil or appropriate insecticidal soap to protect leaves from further bites. Introduce beneficial insects.",
        "disease_name_tamil": "இலை கடி (பூச்சி)",
        "solution_tamil": "இலைகளை மேலும் கடிக்காமல் பாதுகாக்க வேப்ப எண்ணெய் அல்லது சரியான பூச்சிக்கொல்லி சோப்பைப் பயன்படுத்தவும். நன்மை செய்யும் பூச்சிகளை அறிமுகப்படுத்துங்கள்."
    },
    {
        "class": "Diseased - Yellow Spot",
        "disease_name": "Yellow Spot / Fungal",
        "solution": "Use copper-based fungicides. Remove severely affected leaves. Avoid overhead watering.",
        "disease_name_tamil": "மஞ்சள் புள்ளி / பூஞ்சை",
        "solution_tamil": "தாமிர அடிப்படையிலான பூஞ்சை கொல்லிகளைப் பயன்படுத்தவும். கடுமையாக பாதிக்கப்பட்டுள்ள இலைகளை அகற்றவும்."
    }
]

# Load model globally 
MODEL_PATH = 'leaf_classifier_v2.h5'
model = None

try:
    print(f"Loading model from {MODEL_PATH}...")
    model = load_model(MODEL_PATH)
    print("Model loaded successfully!")
    # Try to infer number of classes if possible from output shape
    try:
        num_classes = model.output_shape[-1]
        print(f"Model expects {num_classes} classes.")
        # If the number of real classes doesn't match our dummy LEAF_CLASSES, we will just use modulo
    except Exception as e:
        print(f"Could not infer num_classes: {e}")
except Exception as e:
    print(f"Error loading model: {e}")

@app.route('/')
def index():
    return jsonify({"status": "success", "message": "AgroVision API is running!"})

def preprocess_image(image_path):
    """
    Resize image to 224x224 and normalize
    """
    img = Image.open(image_path)
    
    # Convert RGBA to RGB if needed
    if img.mode != 'RGB':
        img = img.convert('RGB')
        
    img = img.resize((224, 224))
    img_array = img_to_array(img)
    
    # Keras standard generator normalization (0-1)
    img_array = img_array / 255.0
    
    # Expand dims to batch shape: (1, 224, 224, 3)
    img_array = np.expand_dims(img_array, axis=0)
    return img_array

@app.route('/predict', methods=['POST'])
def predict():
    if model is None:
        return jsonify({'error': 'Model currently unavailable. Please check the server logs.'}), 500
        
    if 'image' not in request.files:
        return jsonify({'error': 'No image provided'}), 400
        
    file = request.files['image']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400
        
    if file:
        filename = secure_filename(file.filename)
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(filepath)
        
        try:
            # Process image
            processed_image = preprocess_image(filepath)
            
            # Predict
            predictions = model.predict(processed_image)
            
            # Depending on model architecture (Softmax vs Sigmoid)
            if len(predictions[0]) > 1:
                # Multi-class
                class_idx = np.argmax(predictions[0])
                confidence = float(predictions[0][class_idx]) * 100
            else:
                # Binary classification
                confidence = float(predictions[0][0]) * 100
                class_idx = 1 if confidence > 50 else 0
                if class_idx == 0:
                    confidence = 100 - confidence
            
            # Map robustly in case model has more classes than our placeholder list
            mapped_idx = class_idx % len(LEAF_CLASSES)
            result_data = LEAF_CLASSES[mapped_idx]
            
            # Construct response 
            return_dict = {
                "prediction": "Healthy" if "Healthy" in result_data["class"] else "Diseased",
                "disease_name": result_data["disease_name"],
                "disease_name_tamil": result_data["disease_name_tamil"],
                "confidence": f"{confidence:.1f}%",
                "solution": result_data["solution"],
                "solution_tamil": result_data["solution_tamil"]
            }
            
            # Cleanup optionally
            if os.path.exists(filepath):
                os.remove(filepath)
                
            return jsonify(return_dict)
            
        except Exception as e:
            return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
