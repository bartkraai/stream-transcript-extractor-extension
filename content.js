// Inject fetch override immediately at document_start
var fetchOverride = document.createElement("script");
fetchOverride.src = chrome.runtime.getURL("fetchOverride.js");
fetchOverride.onload = function () {
	this.remove();
};
(document.head || document.documentElement).appendChild(fetchOverride);

// Wait for DOM to be ready before adding UI elements
function initializeUI() {
	let wrapper = document.createElement('div');
	let copyTranscriptButton = document.createElement('button');
	let downloadTranscriptButton = document.createElement('button');
	let closeButton = document.createElement('button');
	let timestampToggle = document.createElement('label');
	let timestampCheckbox = document.createElement('input');

	// Create timestamp toggle
	timestampCheckbox.type = 'checkbox';
	timestampCheckbox.id = 'timestamp-toggle';
	timestampCheckbox.className = 'transcript-extractor-checkbox';
	// Load saved preference
	timestampCheckbox.checked = localStorage.getItem('transcript-include-timestamps') === 'true';
	timestampToggle.className = 'transcript-extractor-label';
	timestampToggle.appendChild(timestampCheckbox);
	timestampToggle.appendChild(document.createTextNode(' Include Timestamps'));

	// Save preference when changed
	timestampCheckbox.addEventListener('change', () => {
		localStorage.setItem('transcript-include-timestamps', timestampCheckbox.checked);
	});

wrapper.appendChild(timestampToggle);
wrapper.appendChild(document.createElement('br'));
wrapper.appendChild(copyTranscriptButton);
wrapper.appendChild(downloadTranscriptButton);
wrapper.appendChild(closeButton);

closeButton.innerHTML = "X";
copyTranscriptButton.innerHTML = "Copy Transcript";
downloadTranscriptButton.innerHTML = "Download Transcript";

	closeButton.className = "transcript-extractor-button";
	copyTranscriptButton.className = "transcript-extractor-button";
	downloadTranscriptButton.className = "transcript-extractor-button transcript-extractor-close-button";
	wrapper.className = "transcript-extractor-wrapper";

		document.querySelector("body").appendChild(wrapper);

	copyTranscriptButton.addEventListener('click', async () => {
		try {
			const textToCopy = getTranscript();
			await navigator.clipboard.writeText(textToCopy);
			alert('Transcript copied to clipboard!');
		} catch (err) {
			console.error("Failed to copy: ", err);
			alert(`Error: ${err.message}`);
		}
	});

	downloadTranscriptButton.addEventListener('click', async () => {
		try {
			const textToDownload = getTranscript();
			download(textToDownload);
		} catch (err) {
			console.error("Failed to download: ", err);
			alert(`Error: ${err.message}`);
		}
	});

	closeButton.addEventListener('click', () => {
		wrapper.remove();
	});
}

function getTranscript() {
	const transcriptDiv = document.getElementById('transcript-extractor-for-microsoft-stream-hidden-div-with-transcript');
	if (!transcriptDiv || !transcriptDiv.innerText) {
		throw new Error('Transcript not found. Please wait for the video to load, or the transcript may not be available for this video.');
	}
	return transcriptDiv.innerText;
}

function download(text) {
	var element = document.createElement('a');
	element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(text));
	element.setAttribute('download', getTranscriptFileName());

	element.style.display = 'none';
	document.body.appendChild(element);

	element.click();

	document.body.removeChild(element);
}

function getTranscriptFileName() {
	// Try multiple selectors for different Stream versions
	const selectors = [
		'h1[class*="videoTitleViewModeHeading"] label',
		'h1[class*="videoTitle"]',
		'h1.video-title',
		'[data-automation-id="video-title"]',
		'h1'
	];
	
	let videoTitle = '';
	for (const selector of selectors) {
		const element = document.querySelector(selector);
		if (element && element.innerText) {
			videoTitle = element.innerText.trim();
			break;
		}
	}

	if (!videoTitle) {
		return 'transcript.txt';
	}

	// Sanitize filename
	const sanitized = videoTitle.replace(/[<>:"/\\|?*]/g, '-');
	return `transcript-${sanitized}.txt`;
}
// Initialize UI when DOM is ready
if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', initializeUI);
} else {
	initializeUI();
}