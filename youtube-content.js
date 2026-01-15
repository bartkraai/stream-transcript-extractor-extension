// YouTube Transcript Extractor
// Detects YouTube video pages and provides caption extraction with Power Automate integration

// Wait for YouTube page to load before initializing
function initializeYouTubeUI() {
	// Check if we're on a video page
	if (!isYouTubeVideoPage()) {
		return;
	}

	// Create and inject UI
	injectTranscriptUI();
}

function isYouTubeVideoPage() {
	// Check if we're on a YouTube watch page
	const url = window.location.href;
	return url.includes('youtube.com/watch') || url.includes('youtu.be/');
}

function injectTranscriptUI() {
	// Prevent duplicate UI injection
	if (document.getElementById('youtube-transcript-wrapper')) {
		return;
	}

	// Create wrapper
	const wrapper = document.createElement('div');
	wrapper.id = 'youtube-transcript-wrapper';
	wrapper.className = 'transcript-extractor-wrapper';

	// Create button container
	const buttonContainer = document.createElement('div');
	buttonContainer.style.display = 'flex';
	buttonContainer.style.gap = '8px';
	buttonContainer.style.flexWrap = 'wrap';

	// Get Captions button
	const getCaptionsButton = document.createElement('button');
	getCaptionsButton.innerHTML = 'Get Captions';
	getCaptionsButton.className = 'transcript-extractor-button';
	getCaptionsButton.addEventListener('click', async () => {
		try {
			const captions = await extractCaptions();
			if (!captions) {
				alert('No captions found for this video. Captions may not be available, or the video may still be loading.');
				return;
			}
			// Store captions in a hidden div for reference
			let hiddenDiv = document.getElementById('youtube-transcript-hidden-div');
			if (!hiddenDiv) {
				hiddenDiv = document.createElement('div');
				hiddenDiv.id = 'youtube-transcript-hidden-div';
				hiddenDiv.style.display = 'none';
				document.body.appendChild(hiddenDiv);
			}
			hiddenDiv.innerText = captions;
			alert('Captions loaded successfully!');
		} catch (err) {
			console.error('Failed to extract captions:', err);
			alert(`Error extracting captions: ${err.message}`);
		}
	});

	// Copy Captions button
	const copyCaptionsButton = document.createElement('button');
	copyCaptionsButton.innerHTML = 'Copy Captions';
	copyCaptionsButton.className = 'transcript-extractor-button';
	copyCaptionsButton.addEventListener('click', async () => {
		try {
			let captions = getCachedCaptions();
			if (!captions) {
				captions = await extractCaptions();
			}
			if (!captions) {
				alert('No captions found. Click "Get Captions" first.');
				return;
			}
			await navigator.clipboard.writeText(captions);
			alert('Captions copied to clipboard!');
		} catch (err) {
			console.error('Failed to copy captions:', err);
			alert(`Error: ${err.message}`);
		}
	});

	// Download Captions button
	const downloadCaptionsButton = document.createElement('button');
	downloadCaptionsButton.innerHTML = 'Download Captions';
	downloadCaptionsButton.className = 'transcript-extractor-button';
	downloadCaptionsButton.addEventListener('click', async () => {
		try {
			let captions = getCachedCaptions();
			if (!captions) {
				captions = await extractCaptions();
			}
			if (!captions) {
				alert('No captions found. Click "Get Captions" first.');
				return;
			}
			downloadFile(captions, getVideoTitle());
		} catch (err) {
			console.error('Failed to download captions:', err);
			alert(`Error: ${err.message}`);
		}
	});

	// Send to Power Automate button
	const sendToPowerAutomateButton = document.createElement('button');
	sendToPowerAutomateButton.innerHTML = 'Send to Power Automate';
	sendToPowerAutomateButton.className = 'transcript-extractor-button';
	sendToPowerAutomateButton.addEventListener('click', async () => {
		try {
			let captions = getCachedCaptions();
			if (!captions) {
				captions = await extractCaptions();
			}
			if (!captions) {
				alert('No captions found. Click "Get Captions" first.');
				return;
			}

			getPowerAutomateUrl(async (powerAutomateUrl) => {
				if (!powerAutomateUrl) {
					showPowerAutomateUrlNotConfiguredAlert();
					return;
				}
				try {
					const title = getVideoTitle();
					const sourceUrl = window.location.href;
					const result = await sendContentToPowerAutomate(title, captions, 'knowledge', sourceUrl, powerAutomateUrl);
					alert(result.message);
				} catch (err) {
					console.error('Failed to send to Power Automate:', err);
					alert(`Error: ${err.message}`);
				}
			});
		} catch (err) {
			console.error('Failed to send to Power Automate:', err);
			alert(`Error: ${err.message}`);
		}
	});

	// Close button
	const closeButton = document.createElement('button');
	closeButton.innerHTML = 'X';
	closeButton.className = 'transcript-extractor-button';
	closeButton.style.marginLeft = 'auto';
	closeButton.addEventListener('click', () => {
		wrapper.remove();
	});

	// Add buttons to container
	buttonContainer.appendChild(getCaptionsButton);
	buttonContainer.appendChild(copyCaptionsButton);
	buttonContainer.appendChild(downloadCaptionsButton);
	buttonContainer.appendChild(sendToPowerAutomateButton);
	buttonContainer.appendChild(closeButton);

	wrapper.appendChild(buttonContainer);

	// Insert wrapper at top of page
	if (document.body.firstChild) {
		document.body.insertBefore(wrapper, document.body.firstChild);
	} else {
		document.body.appendChild(wrapper);
	}
}

function getCachedCaptions() {
	const hiddenDiv = document.getElementById('youtube-transcript-hidden-div');
	return hiddenDiv ? hiddenDiv.innerText : null;
}

function getVideoTitle() {
	// Try to get YouTube video title
	const titleElement = document.querySelector('h1.title.ytd-video-primary-info-renderer yt-formatted-string');
	if (titleElement) {
		return titleElement.innerText.trim();
	}

	// Fallback to page title
	const pageTitle = document.title.replace(' - YouTube', '').trim();
	if (pageTitle) {
		return pageTitle;
	}

	return 'YouTube Video';
}

async function extractCaptions() {
	const videoId = getYouTubeVideoId();
	if (!videoId) {
		throw new Error('Could not extract video ID from URL');
	}

	// Try primary method: Kakulukian HTML parsing approach
	try {
		return await extractCaptionsFromHTML(videoId);
	} catch (primaryErr) {
		console.warn('Primary caption extraction failed, trying fallback:', primaryErr);
		
		// Fallback method: InnerTube API (YouTubeTLDR approach)
		try {
			return await extractCaptionsViaInnerTube(videoId);
		} catch (fallbackErr) {
			console.error('Fallback caption extraction also failed:', fallbackErr);
			throw new Error(`Caption extraction failed. Primary: ${primaryErr.message}. Fallback: ${fallbackErr.message}`);
		}
	}
}

async function extractCaptionsFromHTML(videoId) {
	// Kakulukian method: Fetch watch page and parse HTML
	const response = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
		headers: {
			'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
		}
	});

	if (!response.ok) {
		throw new Error(`Failed to fetch video page: ${response.status}`);
	}

	const html = await response.text();

	// Split by "captions": to extract the JSON section
	const splitHTML = html.split('"captions":');
	if (splitHTML.length < 2) {
		throw new Error('No captions section found in page HTML');
	}

	// Extract and clean the JSON between captions and videoDetails
	const jsonString = splitHTML[1].split(',"videoDetails')[0].replace(/\n/g, '');
	const captionsData = JSON.parse(jsonString.trim());

	// Get the caption tracks from playerCaptionsTracklistRenderer
	const captionTracks = captionsData?.playerCaptionsTracklistRenderer?.captionTracks;
	if (!captionTracks || captionTracks.length === 0) {
		throw new Error('No caption tracks available for this video');
	}

	// Get the first caption track's base URL
	const transcriptUrl = captionTracks[0].baseUrl;
	if (!transcriptUrl) {
		throw new Error('Caption track has no base URL');
	}

	// Fetch the transcript XML
	const transcriptResponse = await fetch(transcriptUrl);
	if (!transcriptResponse.ok) {
		throw new Error(`Failed to fetch transcript: ${transcriptResponse.status}`);
	}

	const xml = await transcriptResponse.text();

	// Parse XML using regex to extract text content
	const regex = /<text start="([^"]*)" dur="([^"]*)">([^<]*)<\/text>/g;
	const captions = [];
	let match;

	while ((match = regex.exec(xml)) !== null) {
		const text = match[3]
			.replace(/&quot;/g, '"')
			.replace(/&amp;/g, '&')
			.replace(/&lt;/g, '<')
			.replace(/&gt;/g, '>')
			.replace(/&#39;/g, "'")
			.trim();
		if (text) {
			captions.push(text);
		}
	}

	if (captions.length === 0) {
		throw new Error('No caption text found in transcript XML');
	}

	return captions.join(' ');
}

async function extractCaptionsViaInnerTube(videoId, language = 'en') {
	// YouTubeTLDR method: Use InnerTube API to get captions
	const API_KEY = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';
	
	const requestBody = {
		context: {
			client: {
				clientName: 'WEB',
				clientVersion: '2.20251113.00.00'
			}
		},
		videoId: videoId
	};

	const playerResponse = await fetch(
		`https://www.youtube.com/youtubei/v1/player?prettyPrint=false&key=${API_KEY}`,
		{
			method: 'POST',
			headers: {
				'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
				'Content-Type': 'application/json',
				'Referer': 'https://www.youtube.com/'
			},
			body: JSON.stringify(requestBody)
		}
	);

	if (!playerResponse.ok) {
		throw new Error(`InnerTube API request failed: ${playerResponse.status}`);
	}

	const playerData = await playerResponse.json();

	// Check for video details
	if (!playerData.videoDetails) {
		throw new Error('Video not found or server IP blocked by YouTube');
	}

	// Extract caption tracks
	const tracks = playerData?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
	if (!tracks || tracks.length === 0) {
		throw new Error(`No captions found for video: ${videoId}`);
	}

	// Select best track: prioritize manual > punctuated ASR > plain ASR
	let selectedTrack = null;
	let priority = 999;

	for (const track of tracks) {
		if (track.languageCode === language) {
			let trackPriority;
			if (!track.baseUrl.includes('kind=asr')) {
				trackPriority = 0; // Manual
			} else if (track.baseUrl.includes('variant=punctuated')) {
				trackPriority = 1; // Punctuated ASR
			} else {
				trackPriority = 2; // Plain ASR
			}

			if (trackPriority < priority) {
				selectedTrack = track;
				priority = trackPriority;
				if (priority === 0) break; // Found manual, stop searching
			}
		}
	}

	if (!selectedTrack) {
		const availableLangs = tracks.map(t => t.languageCode).join(', ');
		throw new Error(`No captions for language '${language}'. Available: ${availableLangs}`);
	}

	// Fetch caption data in JSON format
	const captionUrl = `${selectedTrack.baseUrl.replace(/\\u0026/g, '&')}&fmt=json3`;
	const captionResponse = await fetch(captionUrl);
	
	if (!captionResponse.ok) {
		throw new Error(`Failed to fetch captions: ${captionResponse.status}`);
	}

	const captionData = await captionResponse.json();

	// Process JSON3 format captions
	const captions = [];
	if (captionData.events) {
		for (const event of captionData.events) {
			if (event.segs) {
				for (const seg of event.segs) {
					const text = seg.utf8?.trim();
					if (text) {
						captions.push(text);
					}
				}
			}
		}
	}

	if (captions.length === 0) {
		throw new Error('No caption text found in response');
	}

	return captions.join(' ');
}

function getYouTubeVideoId() {
	// Extract video ID from URL
	const url = window.location.href;
	const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/);
	return match ? match[1] : null;
}

function parseXMLCaptions(text) {
	// Parse XML caption format (YouTube's default)
	try {
		const parser = new DOMParser();
		const xmlDoc = parser.parseFromString(text, 'application/xml');

		if (xmlDoc.parseError) {
			return null;
		}

		const textElements = xmlDoc.getElementsByTagName('text');
		const captions = [];

		for (let i = 0; i < textElements.length; i++) {
			const textContent = textElements[i].textContent
				.replace(/&quot;/g, '"')
				.replace(/&amp;/g, '&')
				.replace(/&lt;/g, '<')
				.replace(/&gt;/g, '>')
				.trim();

			if (textContent) {
				captions.push(textContent);
			}
		}

		return captions.join(' ');
	} catch (err) {
		console.error('Error parsing XML captions:', err);
		return null;
	}
}

function downloadFile(content, videoTitle) {
	const filename = `captions-${videoTitle.replace(/[<>:"/\\|?*]/g, '-')}.txt`;
	const element = document.createElement('a');
	element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(content));
	element.setAttribute('download', filename);
	element.style.display = 'none';
	document.body.appendChild(element);
	element.click();
	document.body.removeChild(element);
}

// Initialize UI when DOM is ready
if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', initializeYouTubeUI);
} else {
	initializeYouTubeUI();
}

// Also try to initialize if page changes (for YouTube's single-page app navigation)
const observer = new MutationObserver(() => {
	if (isYouTubeVideoPage() && !document.getElementById('youtube-transcript-wrapper')) {
		initializeYouTubeUI();
	}
});

observer.observe(document.body, {
	childList: true,
	subtree: true
});
