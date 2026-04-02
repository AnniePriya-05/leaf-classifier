// IMPORTANT: When you host the backend on Render, replace the below URL with your Render URL
// Example: const BACKEND_URL = "https://agrovision-backend.onrender.com";
const BACKEND_URL = "https://leaf-classifier-1.onrender.com"; 

document.addEventListener('DOMContentLoaded', () => {
    // Only run script if we are on scanner page
    const btnEnableCam = document.getElementById('btnEnableCam');
    if (!btnEnableCam) return;

    // Elements
    const videoData = document.getElementById('cameraStream');
    const photoCanvas = document.getElementById('photoCanvas');
    const imagePreview = document.getElementById('imagePreview');
    const placeholder = document.getElementById('mediaPlaceholder');
    
    const btnCapture = document.getElementById('btnCapture');
    const btnPredict = document.getElementById('btnPredict');
    const fileUpload = document.getElementById('fileUpload');

    // Result UI Elements
    const loadingOverlay = document.getElementById('loadingOverlay');
    const resultContainer = document.getElementById('resultContainer');
    const resultContent = document.getElementById('resultContent');
    const waitingState = document.getElementById('waitingState');

    // Result Data Elements
    const predictionText = document.getElementById('predictionText');
    const confidenceVal = document.getElementById('confidenceVal');
    
    // English & Tamil Fields
    const diseaseNameEn = document.getElementById('diseaseNameEn');
    const diseaseNameTa = document.getElementById('diseaseNameTa');
    const solutionTextEn = document.getElementById('solutionTextEn');
    const solutionTextTa = document.getElementById('solutionTextTa');
    
    const langToggle = document.getElementById('langToggle');

    let stream = null;
    let selectedImageBlob = null;

    // 1. Enable Camera
    btnEnableCam.addEventListener('click', async () => {
        try {
            stream = await navigator.mediaDevices.getUserMedia({ 
                video: { facingMode: 'environment' } // Prefer back camera on mobile
            });
            videoData.srcObject = stream;
            
            // UI Toggle
            placeholder.style.display = 'none';
            imagePreview.style.display = 'none';
            videoData.style.display = 'block';
            
            btnEnableCam.style.display = 'none';
            btnCapture.style.display = 'inline-flex';
            
            // Clear previous blob
            selectedImageBlob = null;
            btnPredict.disabled = true;

        } catch (err) {
            console.error("Camera Error:", err);
            alert("Unable to access camera. Please allow permissions or use file upload.");
        }
    });

    // 2. Capture Image
    btnCapture.addEventListener('click', () => {
        if (!stream) return;
        
        const context = photoCanvas.getContext('2d');
        photoCanvas.width = videoData.videoWidth;
        photoCanvas.height = videoData.videoHeight;
        
        // Draw video frame to canvas
        context.drawImage(videoData, 0, 0, photoCanvas.width, photoCanvas.height);
        
        // Stop stream
        stream.getTracks().forEach(track => track.stop());
        stream = null;
        
        // Get blob
        photoCanvas.toBlob((blob) => {
            selectedImageBlob = blob;
            const tempUrl = URL.createObjectURL(blob);
            
            // Update UI
            videoData.style.display = 'none';
            imagePreview.src = tempUrl;
            imagePreview.style.display = 'block';
            
            btnCapture.style.display = 'none';
            btnEnableCam.style.display = 'inline-flex';
            btnEnableCam.innerHTML = '<span class="icon">📹</span> Retake Photo';
            
            btnPredict.disabled = false;
        }, 'image/jpeg');
    });

    // 3. File Upload
    fileUpload.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        selectedImageBlob = file;
        
        // Stop camera if running
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
            stream = null;
        }

        const tempUrl = URL.createObjectURL(file);
        
        // Update UI
        videoData.style.display = 'none';
        placeholder.style.display = 'none';
        imagePreview.src = tempUrl;
        imagePreview.style.display = 'block';
        
        btnCapture.style.display = 'none';
        btnEnableCam.style.display = 'inline-flex';
        btnEnableCam.innerHTML = '<span class="icon">📹</span> Take Photo Instead';
        
        btnPredict.disabled = false;
    });

    // Helper: wake up Render free tier with a ping, retrying until it responds
    async function wakeUpServer(statusEl) {
        statusEl.textContent = '⏳ Waking up server (first load may take ~60s)...';
        for (let i = 0; i < 20; i++) {
            try {
                const res = await fetch(`${BACKEND_URL}/`, { method: 'GET' });
                if (res.ok) {
                    statusEl.textContent = '✅ Server ready! Analyzing...';
                    return true;
                }
            } catch (e) { /* still sleeping, retry */ }
            await new Promise(r => setTimeout(r, 5000)); // wait 5s between pings
        }
        return false; // timed out after ~100s
    }

    // 4. Predict
    btnPredict.addEventListener('click', async () => {
        if (!selectedImageBlob) return;

        // UI Prep
        resultContainer.classList.remove('disabled');
        waitingState.style.display = 'none';
        resultContent.style.display = 'none';
        loadingOverlay.style.display = 'block';
        btnPredict.disabled = true;

        // Update loading text element
        const loadingText = loadingOverlay.querySelector('p');

        // Step 1: Wake up Render server first
        const serverReady = await wakeUpServer(loadingText);
        if (!serverReady) {
            alert("Server is taking too long to wake up. Please try again in a moment.");
            loadingOverlay.style.display = 'none';
            waitingState.style.display = 'block';
            btnPredict.disabled = false;
            return;
        }

        // Step 2: Send the actual image for prediction
        loadingText.textContent = '🔬 Analyzing plant data...';
        const formData = new FormData();
        formData.append('image', selectedImageBlob, 'leaf_image.jpg');

        try {
            const response = await fetch(`${BACKEND_URL}/predict`, {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.error || "Prediction failed on server.");
            }

            const data = await response.json();
            
            // Populate Data
            predictionText.textContent = data.prediction;
            confidenceVal.textContent = data.confidence;
            
            // Assign English details
            diseaseNameEn.textContent = data.disease_name;
            solutionTextEn.textContent = data.solution;
            
            // Assign Tamil details
            diseaseNameTa.textContent = data.disease_name_tamil || "தரவு இல்லை";
            solutionTextTa.textContent = data.solution_tamil || "தரவு இல்லை";

            // Color coding status
            if(data.prediction === "Healthy") {
                predictionText.style.color = "var(--success)";
            } else {
                predictionText.style.color = "var(--danger)";
            }

            toggleLanguageDisplay(langToggle.checked);

            loadingOverlay.style.display = 'none';
            resultContent.style.display = 'block';
            
        } catch (error) {
            console.error(error);
            alert("Error during prediction: " + error.message);
            loadingOverlay.style.display = 'none';
            waitingState.style.display = 'block';
        } finally {
            btnPredict.disabled = false;
        }
    });

    // Language Toggle Listener
    langToggle.addEventListener('change', (e) => {
        toggleLanguageDisplay(e.target.checked);
    });

    function toggleLanguageDisplay(showTamil) {
        if(showTamil) {
            diseaseNameEn.style.display = 'none';
            solutionTextEn.style.display = 'none';
            diseaseNameTa.style.display = 'block';
            solutionTextTa.style.display = 'block';
            
            document.querySelector('.lang-label').textContent = 'தமிழ் (Tamil) - ON';
        } else {
            diseaseNameEn.style.display = 'block';
            solutionTextEn.style.display = 'block';
            diseaseNameTa.style.display = 'none';
            solutionTextTa.style.display = 'none';
            
            document.querySelector('.lang-label').textContent = 'English (Tamil) - OFF';
        }
    }
});
