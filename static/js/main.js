// Global state
let currentImageBase64 = null;
let currentAnalysis = null;

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    checkApiStatus();
    setupFileUpload();
    setupAnalyzeButton();
    setupDownloadButton();
});

// Check API status
async function checkApiStatus() {
    try {
        const response = await fetch('/api/health');
        const data = await response.json();
        const statusBox = document.getElementById('api-status');
        const statusText = document.getElementById('status-text');
        
        if (data.api_configured) {
            statusBox.className = 'status-box success';
            statusText.textContent = 'Workspace ready!';
        } else {
            statusBox.className = 'status-box error';
            statusText.textContent = 'Google API key is not configured on the server. Please set GOOGLE_API_KEY in your environment or .env file.';
        }
    } catch (error) {
        const statusBox = document.getElementById('api-status');
        const statusText = document.getElementById('status-text');
        statusBox.className = 'status-box error';
        statusText.textContent = 'Error checking API status.';
    }
}

// Setup file upload
function setupFileUpload() {
    const fileInput = document.getElementById('file-input');
    
    // Drag and drop handlers
    const uploadContainer = document.querySelector('.upload-container');
    
    uploadContainer.addEventListener('dragover', function(e) {
        e.preventDefault();
        uploadContainer.style.borderColor = 'var(--primary-color)';
        uploadContainer.style.backgroundColor = '#f0f8ff';
    });
    
    uploadContainer.addEventListener('dragleave', function(e) {
        e.preventDefault();
        uploadContainer.style.borderColor = 'var(--border-color)';
        uploadContainer.style.backgroundColor = 'var(--card-bg)';
    });
    
    uploadContainer.addEventListener('drop', function(e) {
        e.preventDefault();
        uploadContainer.style.borderColor = 'var(--border-color)';
        uploadContainer.style.backgroundColor = 'var(--card-bg)';
        
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            handleFileSelect(files[0]);
        }
    });
    
    // File input change handler
    fileInput.addEventListener('change', function(e) {
        if (e.target.files && e.target.files.length > 0) {
            handleFileSelect(e.target.files[0]);
        }
    });
}

// Handle file selection
async function handleFileSelect(file) {
    // Validate file type
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'application/dicom', 'application/octet-stream'];
    const validExtensions = ['.jpg', '.jpeg', '.png', '.dcm', '.dicom'];
    const fileExtension = '.' + file.name.split('.').pop().toLowerCase();
    
    if (!validTypes.includes(file.type) && !validExtensions.includes(fileExtension)) {
        showError('Invalid file type. Please upload JPG, JPEG, PNG, or DICOM files.');
        return;
    }
    
    // Show preview
    const formData = new FormData();
    formData.append('file', file);
    
    try {
        const response = await fetch('/api/upload', {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        
        if (data.success) {
            document.getElementById('preview-image').src = data.preview;
            currentImageBase64 = data.preview;
            document.getElementById('image-section').classList.remove('hidden');
            document.getElementById('analysis-section').classList.add('hidden');
            hideError();
            
            // Reset file input so the same file can be selected again
            const fileInput = document.getElementById('file-input');
            fileInput.value = '';
        } else {
            showError(data.error || 'Failed to upload image.');
        }
    } catch (error) {
        showError('Error uploading image: ' + error.message);
    }
}

// Setup analyze button
function setupAnalyzeButton() {
    const analyzeBtn = document.getElementById('analyze-btn');
    analyzeBtn.addEventListener('click', async function() {
        const fileInput = document.getElementById('file-input');
        if (!fileInput.files.length) {
            showError('Please upload an image first.');
            return;
        }
        
        await analyzeImage(fileInput.files[0]);
    });
}

// Analyze image
async function analyzeImage(file) {
    const loadingDiv = document.getElementById('loading');
    const analyzeBtn = document.getElementById('analyze-btn');
    const analysisSection = document.getElementById('analysis-section');
    
    // Show loading, hide results, disable button
    loadingDiv.classList.remove('hidden');
    analysisSection.classList.add('hidden');
    analyzeBtn.disabled = true;
    hideError();
    
    const formData = new FormData();
    formData.append('file', file);
    
    try {
        const response = await fetch('/api/analyze', {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        
        if (data.success) {
            currentAnalysis = data.analysis;
            currentImageBase64 = data.image_base64;
            
            // Display analysis
            displayAnalysis(data.analysis);
            analysisSection.classList.remove('hidden');
        } else {
            showError(data.error || 'Analysis failed.');
        }
    } catch (error) {
        showError('Error analyzing image: ' + error.message);
    } finally {
        loadingDiv.classList.add('hidden');
        analyzeBtn.disabled = false;
    }
}

// Display analysis results
function displayAnalysis(analysis) {
    const analysisContent = document.getElementById('analysis-content');
    
    // Convert markdown to HTML (improved conversion)
    let html = analysis;
    
    // Convert headers (order matters - do ### before ## before #)
    html = html.replace(/^### (.*$)/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.*$)/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.*$)/gm, '<h1>$1</h1>');
    
    // Convert bold text
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/__(.*?)__/g, '<strong>$1</strong>');
    
    // Convert italic text
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
    html = html.replace(/_(.*?)_/g, '<em>$1</em>');
    
    // Convert lists (handle both - and *)
    html = html.replace(/^[-*] (.*$)/gm, '<li>$1</li>');
    
    // Wrap consecutive list items in <ul> tags
    html = html.replace(/(<li>.*<\/li>(\n|$))+/g, function(match) {
        return '<ul>' + match.replace(/\n/g, '') + '</ul>';
    });
    
    // Convert horizontal rules
    html = html.replace(/^---$/gm, '<hr>');
    
    // Split into paragraphs (double newlines)
    let paragraphs = html.split(/\n\n+/);
    html = paragraphs.map(p => {
        p = p.trim();
        if (!p) return '';
        // Don't wrap if it's already a block element
        if (p.match(/^<(h[1-6]|ul|ol|hr)/)) {
            return p;
        }
        return '<p>' + p + '</p>';
    }).join('\n');
    
    // Clean up any remaining single newlines within paragraphs
    html = html.replace(/(<p>.*?<\/p>)/gs, function(match) {
        return match.replace(/\n/g, ' ').replace(/\s+/g, ' ');
    });
    
    analysisContent.innerHTML = html;
}

// Setup download button
function setupDownloadButton() {
    const downloadBtn = document.getElementById('download-btn');
    downloadBtn.addEventListener('click', async function() {
        if (!currentAnalysis || !currentImageBase64) {
            showError('No analysis available to download.');
            return;
        }
        
        await downloadDocx();
    });
}

// Download DOCX
async function downloadDocx() {
    try {
        const response = await fetch('/api/download-docx', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                analysis: currentAnalysis,
                image_base64: currentImageBase64
            })
        });
        
        if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'medical_image_analysis.docx';
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } else {
            const data = await response.json();
            showError(data.error || 'Failed to download document.');
        }
    } catch (error) {
        showError('Error downloading document: ' + error.message);
    }
}

// Show error message
function showError(message) {
    const errorDiv = document.getElementById('error-message');
    errorDiv.textContent = message;
    errorDiv.classList.remove('hidden');
    
    // Scroll to error
    errorDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// Hide error message
function hideError() {
    const errorDiv = document.getElementById('error-message');
    errorDiv.classList.add('hidden');
}

