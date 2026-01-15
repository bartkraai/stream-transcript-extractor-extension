// Shared utility for Power Automate integration
// Used by both Microsoft Stream and YouTube content scripts

/**
 * Retrieves the Power Automate webhook URL from extension storage
 * @param {Function} callback - Callback function receiving the URL
 */
function getPowerAutomateUrl(callback) {
	// Try chrome.storage API first (recommended for extensions)
	if (chrome && chrome.storage && chrome.storage.sync) {
		chrome.storage.sync.get('powerautomate-url', (result) => {
			const url = result['powerautomate-url'];
			callback(url || null);
		});
	} else if (chrome && chrome.storage && chrome.storage.local) {
		// Fallback to local storage if sync is not available
		chrome.storage.local.get('powerautomate-url', (result) => {
			const url = result['powerautomate-url'];
			callback(url || null);
		});
	} else {
		// Fallback to localStorage if chrome.storage is not available
		const url = localStorage.getItem('powerautomate-url');
		callback(url || null);
	}
}

/**
 * Saves the Power Automate webhook URL to extension storage
 * @param {string} url - The Power Automate webhook URL
 * @param {Function} callback - Callback function on success
 */
function setPowerAutomateUrl(url, callback) {
	if (chrome && chrome.storage && chrome.storage.sync) {
		chrome.storage.sync.set({ 'powerautomate-url': url }, callback);
	} else if (chrome && chrome.storage && chrome.storage.local) {
		chrome.storage.local.set({ 'powerautomate-url': url }, callback);
	} else {
		localStorage.setItem('powerautomate-url', url);
		if (callback) callback();
	}
}

/**
 * Sends content (transcript or captions) to Power Automate
 * @param {string} subject - The video/meeting subject/title
 * @param {string} content - The transcript or captions text
 * @param {string} subtype - The content subtype: "meeting" for Stream, "knowledge" for YouTube
 * @param {string} sourceUrl - The source URL of the video/meeting
 * @param {string} powerAutomateUrl - The Power Automate webhook URL
 * @returns {Promise<void>}
 */
async function sendContentToPowerAutomate(subject, content, subtype, sourceUrl, powerAutomateUrl) {
	if (!powerAutomateUrl) {
		throw new Error('Power Automate URL not configured. Please configure it in extension settings.');
	}

	const payload = {
		"subject": subject,
		"transcript": content,
		"subtype": subtype,
		"sourceUrl": sourceUrl
	};

	try {
		const response = await fetch(powerAutomateUrl, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(payload)
		});

		if (!response.ok) {
			throw new Error(`Power Automate returned status ${response.status}`);
		}

		return {
			success: true,
			message: 'Content sent to Power Automate successfully!'
		};
	} catch (err) {
		throw new Error(`Failed to send to Power Automate: ${err.message}`);
	}
}

/**
 * Shows notification to user with error or success message
 * @param {string} urlNotConfiguredMessage - Optional custom message for unconfigured URL
 */
function showPowerAutomateUrlNotConfiguredAlert(urlNotConfiguredMessage = null) {
	const message = urlNotConfiguredMessage ||
		'Please configure Power Automate URL in extension settings first.\n\nRight-click the extension icon and select "Options".';
	alert(message);
}
