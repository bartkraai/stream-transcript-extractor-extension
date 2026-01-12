// Load saved settings
document.addEventListener('DOMContentLoaded', () => {
    const urlInput = document.getElementById('powerautomate-url');
    
    // Try chrome.storage API first (recommended for extensions)
    if (chrome && chrome.storage && chrome.storage.sync) {
        chrome.storage.sync.get('powerautomate-url', (result) => {
            if (result['powerautomate-url']) {
                urlInput.value = result['powerautomate-url'];
            }
        });
    } else if (chrome && chrome.storage && chrome.storage.local) {
        // Fallback to local storage if sync is not available
        chrome.storage.local.get('powerautomate-url', (result) => {
            if (result['powerautomate-url']) {
                urlInput.value = result['powerautomate-url'];
            }
        });
    }
});

// Save settings
document.getElementById('save').addEventListener('click', () => {
    const urlInput = document.getElementById('powerautomate-url');
    const url = urlInput.value.trim();
    const statusDiv = document.getElementById('status');
    
    if (url) {
        // Save to chrome.storage API (primary method)
        if (chrome && chrome.storage && chrome.storage.sync) {
            chrome.storage.sync.set({ 'powerautomate-url': url }, () => {
                showStatus('Settings saved successfully!', 'success');
            });
        } else if (chrome && chrome.storage && chrome.storage.local) {
            // Fallback to local storage if sync is not available
            chrome.storage.local.set({ 'powerautomate-url': url }, () => {
                showStatus('Settings saved successfully!', 'success');
            });
        }
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
