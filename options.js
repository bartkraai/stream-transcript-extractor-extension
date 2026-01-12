// Load saved settings
document.addEventListener('DOMContentLoaded', () => {
    const urlInput = document.getElementById('powerautomate-url');
    const savedUrl = localStorage.getItem('powerautomate-url');
    
    if (savedUrl) {
        urlInput.value = savedUrl;
    }
});

// Save settings
document.getElementById('save').addEventListener('click', () => {
    const urlInput = document.getElementById('powerautomate-url');
    const url = urlInput.value.trim();
    const statusDiv = document.getElementById('status');
    
    if (url) {
        localStorage.setItem('powerautomate-url', url);
        showStatus('Settings saved successfully!', 'success');
    } else {
        showStatus('Please enter a valid URL.', 'error');
    }
});

function showStatus(message, type) {
    const statusDiv = document.getElementById('status');
    statusDiv.textContent = message;
    statusDiv.className = `status ${type}`;
    statusDiv.style.display = 'block';
    
    setTimeout(() => {
        statusDiv.style.display = 'none';
    }, 3000);
}
