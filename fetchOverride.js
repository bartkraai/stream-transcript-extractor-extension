(() => {
	const { fetch: originalFetch } = window;

	// Function to convert timestamp (in ticks or milliseconds) to MM:SS format
	function formatTimestamp(ticks) {
		if (!ticks && ticks !== 0) return null;
		
		// Ticks are in 100-nanosecond units, convert to seconds
		let seconds = Math.floor(ticks / 10000000);
		
		// If the number seems too large for ticks, try milliseconds
		if (seconds > 86400) { // More than 24 hours suggests it's not ticks
			seconds = Math.floor(ticks / 1000);
		}
		
		const minutes = Math.floor(seconds / 60);
		const secs = seconds % 60;
		
		return `${minutes}:${secs.toString().padStart(2, '0')}`;
	}

	// Helper function to get speaker name from ID
	function getSpeakerName(speakerId) {
		if (!speakerId) return 'Unknown Speaker';
		
		// Check if we have real name mapping
		if (window.speakerNamesMap && window.speakerNamesMap.has(speakerId)) {
			return window.speakerNamesMap.get(speakerId);
		}
		
		// If it's a GUID, try to find the name on the page
		if (typeof speakerId === 'string' && speakerId.match(/^[0-9a-f-]{36}$/i)) {
			// Try to find speaker name in the DOM by searching for the GUID
			const speakerElements = document.querySelectorAll(`[data-speaker-id="${speakerId}"], [data-speakerid="${speakerId}"]`);
			if (speakerElements.length > 0) {
				const name = speakerElements[0].textContent?.trim() || speakerElements[0].getAttribute('title') || speakerElements[0].getAttribute('aria-label');
				if (name) {
					if (!window.speakerNamesMap) window.speakerNamesMap = new Map();
					window.speakerNamesMap.set(speakerId, name);
					return name;
				}
			}
			
			// Fall back to numbered speaker labels
			if (!window.speakerNumberMap) window.speakerNumberMap = new Map();
			if (!window.speakerNumberMap.has(speakerId)) {
				window.speakerNumberMap.set(speakerId, `Speaker ${window.speakerNumberMap.size + 1}`);
			}
			return window.speakerNumberMap.get(speakerId);
		}
		
		// Return as-is if not a GUID
		return speakerId;
	}

	// Helper function to store transcript (waits for body if needed)
	function storeTranscript(transcriptText) {
		if (!transcriptText || !transcriptText.trim()) {
			console.warn('Cannot store empty transcript');
			return;
		}

		const doStore = () => {
			let hiddenDiv = document.getElementById('transcript-extractor-for-microsoft-stream-hidden-div-with-transcript');
			if (!hiddenDiv) {
				hiddenDiv = document.createElement('div');
				hiddenDiv.style.display = 'none';
				hiddenDiv.id = 'transcript-extractor-for-microsoft-stream-hidden-div-with-transcript';
				document.body.appendChild(hiddenDiv);
			}
			hiddenDiv.textContent = transcriptText;
			console.log('✅ Transcript stored successfully!', transcriptText.length, 'characters');
		};

		if (document.body) {
			doStore();
		} else {
			// Wait for body to be available
			const checkBody = setInterval(() => {
				if (document.body) {
					clearInterval(checkBody);
					doStore();
				}
			}, 50);
			
			// Fallback: also listen for DOMContentLoaded
			document.addEventListener('DOMContentLoaded', () => {
				clearInterval(checkBody);
				if (!document.getElementById('transcript-extractor-for-microsoft-stream-hidden-div-with-transcript')) {
					doStore();
				}
			});
		}
	}

	window.fetch = async (...args) => {
		let [resource, config] = args;
		const response = await originalFetch(resource, config);

		const clone = response.clone();

		// Check for any API response that might contain speaker/participant information
		if (typeof resource === 'string' && (
			resource.includes('participant') || 
			resource.includes('attendee') || 
			resource.includes('user') ||
			resource.includes('people') ||
			resource.includes('profile')
		)) {
			clone.json().then(data => {
				try {
					// Try to extract speaker mappings from various API response structures
					if (!window.speakerNamesMap) window.speakerNamesMap = new Map();
					
					const extractSpeakers = (obj) => {
						if (!obj || typeof obj !== 'object') return;
						
						if (Array.isArray(obj)) {
							obj.forEach(extractSpeakers);
						} else {
							// Look for speaker/participant objects with id and name
							if (obj.id && (obj.name || obj.displayName || obj.userName)) {
								const name = obj.name || obj.displayName || obj.userName;
								window.speakerNamesMap.set(obj.id, name);
								console.log('Found speaker from API:', obj.id, '->', name);
							}
							
							// Recurse into nested objects
							Object.values(obj).forEach(extractSpeakers);
						}
					};
					
					extractSpeakers(data);
				} catch (e) { /* ignore parsing errors */ }
			}).catch(() => { /* ignore if not JSON */ });
		}

		// Check for transcript metadata endpoints (SharePoint/Stream API)
		const isTranscriptMetadata = typeof resource === 'string' && (
			resource.includes('media/transcripts') || 
			resource.includes('audioTracks') ||
			resource.includes('streamContent')
		);

		if (isTranscriptMetadata) {
			clone.json()
				.then(async (data) => {
					if (!data) {
						console.warn('Transcript metadata is empty');
						return;
					}

					// New SharePoint/Stream API structure with temporaryDownloadUrl
					if (data.media && data.media.transcripts && Array.isArray(data.media.transcripts)) {
						const transcript = data.media.transcripts[0];
						if (transcript && transcript.temporaryDownloadUrl) {
							console.log('Fetching transcript from:', transcript.temporaryDownloadUrl);
							try {
								// First, try to extract speaker names from the page
								if (!window.speakerNamesMap) {
									window.speakerNamesMap = new Map();
									
									// Try to find speaker information in the page DOM
									// Method 1: Look for data attributes with speaker IDs
									const speakerElements = document.querySelectorAll('[data-speaker-id], [data-speakerid], [class*="speaker"], [class*="participant"]');
									speakerElements.forEach(el => {
										const speakerId = el.getAttribute('data-speaker-id') || el.getAttribute('data-speakerid');
										const speakerName = el.textContent?.trim() || el.getAttribute('title') || el.getAttribute('aria-label');
										if (speakerId && speakerName) {
											window.speakerNamesMap.set(speakerId, speakerName);
											console.log('Found speaker mapping:', speakerId, '->', speakerName);
										}
									});
									
									// Method 2: Try to find in React/Angular data properties
									const allElements = document.querySelectorAll('*');
									allElements.forEach(el => {
										// Check for React internal properties
										for (const key in el) {
											if (key.startsWith('__react') || key.startsWith('__angular')) {
												try {
													const props = el[key];
													if (props && props.memoizedProps && props.memoizedProps.speaker) {
														const speaker = props.memoizedProps.speaker;
														if (speaker.id && speaker.name) {
															window.speakerNamesMap.set(speaker.id, speaker.name);
															console.log('Found speaker mapping:', speaker.id, '->', speaker.name);
														}
													}
												} catch (e) { /* ignore */ }
											}
										}
									});
								}
								
								// Fetch the actual transcript content
								const transcriptResponse = await originalFetch(transcript.temporaryDownloadUrl);
								const transcriptText = await transcriptResponse.text();
								
								console.log('Transcript text sample:', transcriptText.substring(0, 200));
								
								// Parse transcript format
								let parsedText = '';
								
								// Check if it's WebVTT format
								if (transcriptText.trim().startsWith('WEBVTT')) {
									console.log('Detected WebVTT format, parsing...');
									const includeTimestamps = localStorage.getItem('transcript-include-timestamps') === 'true';
								console.log('Include timestamps:', includeTimestamps);
								
								const lines = [];
								let currentSpeaker = null;
								
								// Parse WebVTT format
								const vttLines = transcriptText.split('\n');
								let i = 0;
								
								while (i < vttLines.length) {
									const line = vttLines[i].trim();
									
									// Look for timestamp lines (format: 00:00:04.000 --> 00:00:08.000)
									if (line.includes('-->')) {
										const timeMatch = line.match(/^(\d{2}:\d{2}:\d{2})/);
										const timestamp = timeMatch ? timeMatch[1].substring(3) : null; // Extract MM:SS
										
										i++; // Move to text line(s)
										
										// Collect all text lines for this timestamp block (until blank line or next timestamp)
										const textLines = [];
										while (i < vttLines.length && vttLines[i].trim() !== '' && !vttLines[i].includes('-->')) {
											textLines.push(vttLines[i].trim());
											i++;
										}
										
										if (textLines.length > 0) {
											let fullText = textLines.join(' ');
											
											// Extract speaker name from <v SpeakerName> tag
											let speakerLabel = null;
											const speakerMatch = fullText.match(/<v\s+([^>]+)>/);
											if (speakerMatch) {
												speakerLabel = speakerMatch[1].trim();
												fullText = fullText.replace(/<v\s+[^>]+>/g, '').replace(/<\/v>/g, '').trim();
												console.log('Found speaker:', speakerLabel, 'at time:', timestamp);
											}
											
											// If we found a speaker name, check if it changed
											if (speakerLabel) {
												if (currentSpeaker !== speakerLabel) {
													currentSpeaker = speakerLabel;
													
													if (lines.length > 0) lines.push(''); // Blank line between speakers
													
													if (includeTimestamps && timestamp) {
														lines.push(speakerLabel);
														lines.push(timestamp);
													} else {
														lines.push(`[${speakerLabel}]`);
													}
												}
												
												// Add the text content
												if (fullText) {
													lines.push(fullText);
												}
											} else {
												// No speaker tag found - still add the text to current speaker
												console.warn('No speaker tag found for text:', fullText.substring(0, 50));
												if (fullText) {
													lines.push(fullText);
												}
											}
										}
										continue; // Skip the i++ at the end since we already advanced
									}
									i++;
								}
								
								console.log('Parsed VTT lines:', lines.length);
									try {
										const transcriptData = JSON.parse(transcriptText);
										
										if (transcriptData.recognizedPhrases && Array.isArray(transcriptData.recognizedPhrases)) {
											// Group phrases by speaker and format with speaker labels
											let currentSpeaker = null;
											const lines = [];
											
											transcriptData.recognizedPhrases.forEach(phrase => {
												if (phrase.nBest && phrase.nBest[0]) {
													const text = phrase.nBest[0].display;
													const speakerId = phrase.speaker;
													
													// Get speaker name - try real name first, then fall back to numbered label
													let speakerLabel = getSpeakerName(speakerId);
													
													// Try to get timestamp from various possible fields
													const timestamp = phrase.offsetInTicks || phrase.offset || phrase.startTime || phrase.timestamp;
													const formattedTime = timestamp ? formatTimestamp(timestamp) : null;
													
													// Check if timestamps should be included
													const includeTimestamps = localStorage.getItem('transcript-include-timestamps') === 'true';
													
													// Add speaker label when speaker changes
													if (currentSpeaker !== speakerLabel) {
														currentSpeaker = speakerLabel;
														
														if (lines.length > 0) lines.push(''); // Add blank line between speakers
														
														if (includeTimestamps && formattedTime) {
															// Option B: Name on first line, timestamp on second line
															lines.push(speakerLabel);
															lines.push(formattedTime);
														} else {
															// Original format with brackets
															lines.push(`[${speakerLabel}]`);
														}
													}
													
													lines.push(text);
												}
											});
											
											parsedText = lines.join('\n').trim();
										} else if (transcriptData.entries && Array.isArray(transcriptData.entries)) {
											// Legacy format with possible speaker info
											let currentSpeaker = null;
											const lines = [];
											
											transcriptData.entries.forEach(entry => {
												const text = entry.text || '';
												const speakerId = entry.speaker || entry.speakerId;
												
												// Get speaker name - try real name first, then fall back to numbered label
												let speakerLabel = getSpeakerName(speakerId);
												
												// Try to get timestamp from various possible fields
												const timestamp = entry.offsetInTicks || entry.offset || entry.startTime || entry.timestamp;
												const formattedTime = timestamp ? formatTimestamp(timestamp) : null;
												
												// Check if timestamps should be included
												const includeTimestamps = localStorage.getItem('transcript-include-timestamps') === 'true';
												
												// Add speaker label when speaker changes
												if (currentSpeaker !== speakerLabel) {
													currentSpeaker = speakerLabel;
													
													if (lines.length > 0) lines.push(''); // Add blank line between speakers
													
													if (includeTimestamps && formattedTime) {
														// Option B: Name on first line, timestamp on second line
														lines.push(speakerLabel);
														lines.push(formattedTime);
													} else {
														// Original format with brackets
														lines.push(`[${speakerLabel}]`);
													}
												}
												
												lines.push(text);
											});
											
											parsedText = lines.join('\n').trim();
										} else {
											// If we can't parse structure, use the raw text
											parsedText = transcriptText;
										}
									} catch (parseErr) {
										console.warn('Failed to parse as JSON, using raw text:', parseErr);
										// If JSON parsing fails, use text as-is
										parsedText = transcriptText;
									}
								}

								if (parsedText && parsedText.trim()) {
									storeTranscript(parsedText);
								} else {
									console.warn('Transcript text is empty after parsing');
								}
							} catch (fetchErr) {
								console.error('Error fetching transcript content:', fetchErr);
							}
						}
					}
					// Legacy structure with embedded transcript
					else if (data.entries && Array.isArray(data.entries)) {
						const transcriptText = data.entries
							.map(x => x.text || '')
							.join('\n');
						
						if (transcriptText.trim()) {
							storeTranscript(transcriptText);
							console.log('✅ Transcript extracted successfully (legacy format)!');
						}
					}
				})
				.catch((err) => {
					console.error('Error extracting transcript:', err);
				});
		}

		return response;
	};
})();
