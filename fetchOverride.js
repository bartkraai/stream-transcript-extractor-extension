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
			
			// Prepend meeting room if available
			let finalText = transcriptText;
			if (window.meetingRoomName) {
				finalText = `Meeting Room: ${window.meetingRoomName}\n\n${transcriptText}`;
			}
			
			hiddenDiv.textContent = finalText;
			console.log('✅ Transcript stored successfully!', finalText.length, 'characters');
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

		// Log all API calls to help debug
		if (typeof resource === 'string') {
			console.log('🔍 API Call:', resource.substring(0, 150));
			
			// Extract and track event/meeting IDs from URLs
			const eventIdMatch = resource.match(/[?&]id=([^&]+)/i) || 
			                     resource.match(/\/events\/([a-f0-9-]{36})/i) ||
			                     resource.match(/\/meetings\/([a-f0-9-]{36})/i) ||
			                     resource.match(/eventId[=\/]([a-f0-9-]{36})/i);
			
			if (eventIdMatch) {
				const eventId = eventIdMatch[1];
				if (!window.currentEventId || window.currentEventId !== eventId) {
					window.currentEventId = eventId;
					console.log('📅 Event/Meeting ID detected:', eventId);
				}
				console.log('📅 API call using Event ID:', eventId, 'in URL:', resource.substring(0, 100));
			}
		}

		// Check for any API response that might contain speaker/participant information
		// Expanded list of patterns to catch speaker data
		if (typeof resource === 'string' && (
			resource.includes('participant') || 
			resource.includes('attendee') || 
			resource.includes('user') ||
			resource.includes('people') ||
			resource.includes('profile') ||
			resource.includes('meeting') ||
			resource.includes('conversation') ||
			resource.includes('member') ||
			resource.includes('organizer') ||
			resource.includes('speaker') ||
			resource.includes('metadata') ||
			resource.includes('properties')
		)) {
			// Speaker extraction removed - focus on meeting room only
			clone.json().then(data => {
				try {
					console.log('📋 Potential metadata API response:', resource.substring(0, 100));
					
					// Extract meeting room information
					const extractMeetingRoom = (obj) => {
						if (!obj || typeof obj !== 'object') return;
						
						// Check for room/location fields in the response
						if (obj.location && typeof obj.location === 'string') {
							window.meetingRoomName = obj.location;
							console.log('🏢 Found meeting room:', obj.location);
						} else if (obj.location && obj.location.displayName) {
							window.meetingRoomName = obj.location.displayName;
							console.log('🏢 Found meeting room:', obj.location.displayName);
						} else if (obj.meetingRoom) {
							window.meetingRoomName = obj.meetingRoom;
							console.log('🏢 Found meeting room:', obj.meetingRoom);
						} else if (obj.room) {
							window.meetingRoomName = obj.room;
							console.log('🏢 Found meeting room:', obj.room);
						}
						
						// Recursively search for room info in nested objects
						if (Array.isArray(obj)) {
							obj.forEach(extractMeetingRoom);
						} else {
							Object.values(obj).forEach(val => {
								if (val && typeof val === 'object') {
									extractMeetingRoom(val);
								}
							});
						}
					};
					
					extractMeetingRoom(data);
				} catch (e) { 
					console.error('Error extracting meeting room:', e);
				}
			}).catch(() => { /* ignore if not JSON */ });
		}

		// Check for transcript metadata endpoints (SharePoint/Stream API)
		const isTranscriptMetadata = typeof resource === 'string' && (
			resource.includes('media/transcripts') || 
			resource.includes('audioTracks') ||
			resource.includes('streamContent')
		);

		if (isTranscriptMetadata) {
			// Handle potentially compressed metadata response
			(async () => {
				try {
					console.log('🎯 Step 1: Starting transcript metadata processing');
					const metadataClone = response.clone();
					const contentEncoding = metadataClone.headers.get('content-encoding');
					
					console.log('📦 Transcript metadata headers:', {
						contentEncoding,
						contentType: metadataClone.headers.get('content-type'),
						status: metadataClone.status
					});
					
					let data;
					
					// If content-encoding header is set, browser auto-decompresses, use .json() directly
					if (contentEncoding === 'gzip' || contentEncoding === 'deflate') {
						console.log('📄 Step 2a: Content-Encoding set, browser will auto-decompress, using .json()');
						try {
							data = await metadataClone.json();
							console.log('✅ Step 2b: JSON parse successful (browser decompressed)');
						} catch (jsonErr) {
							console.error('❌ JSON parse error after browser decompression:', jsonErr);
							throw jsonErr;
						}
					} else {
						// No content-encoding header, check if data is actually compressed
						const arrayBuffer = await metadataClone.arrayBuffer();
						const bytes = new Uint8Array(arrayBuffer);
						
						// Check for gzip magic number (0x1f 0x8b)
						const isGzipped = bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
						console.log('🔍 Detected format:', {
							isGzipped,
							firstBytes: Array.from(bytes.slice(0, 10)).map(b => '0x' + b.toString(16)).join(' ')
						});
						
						if (isGzipped) {
							// Manually decompress
							console.log('🗜️ Step 2a: Data is gzipped (no header), manually decompressing...');
							try {
								const blob = new Blob([arrayBuffer]);
								const ds = new DecompressionStream('gzip');
								const decompressedStream = blob.stream().pipeThrough(ds);
								const decompressedBlob = await new Response(decompressedStream).blob();
								const text = await decompressedBlob.text();
								data = JSON.parse(text);
								console.log('✅ Step 2b: Manual decompression successful');
							} catch (decompressErr) {
								console.error('❌ Manual decompression error:', decompressErr);
								throw decompressErr;
							}
						} else {
							// Try parsing as plain JSON first
							console.log('📄 Step 2a: No gzip magic number detected, trying direct JSON parse');
							try {
								const text = new TextDecoder().decode(arrayBuffer);
								console.log('📄 Step 2b: Decoded text, length:', text.length, 'sample:', text.substring(0, 100));
								data = JSON.parse(text);
								console.log('✅ Step 2c: Direct JSON parse successful');
							} catch (jsonErr) {
								// JSON parse failed - data might be compressed without proper magic number
								console.warn('⚠️ JSON parse failed, attempting gzip decompression as fallback...');
								console.log('⚠️ Parse error was:', jsonErr.message);
								try {
									const blob = new Blob([arrayBuffer]);
									const ds = new DecompressionStream('gzip');
									const decompressedStream = blob.stream().pipeThrough(ds);
									const decompressedBlob = await new Response(decompressedStream).blob();
									const text = await decompressedBlob.text();
									data = JSON.parse(text);
									console.log('✅ Step 2d: Fallback decompression successful!');
								} catch (fallbackErr) {
									console.error('❌ Fallback decompression also failed:', fallbackErr);
									console.error('❌ First 200 bytes as hex:', Array.from(bytes.slice(0, 200)).map(b => '0x' + b.toString(16)).join(' '));
									// Re-throw the original JSON error since decompression didn't help
									throw jsonErr;
								}
							}
						}
					}
					
					console.log('📄 Step 3: Transcript metadata response:', JSON.stringify(data).substring(0, 300));

					if (!data) {
						console.warn('⚠️ Step 4: Transcript metadata is empty');
						return;
					}

					console.log('✅ Step 4: Metadata is valid, checking structure');

					// New SharePoint/Stream API structure with temporaryDownloadUrl
					if (data.media && data.media.transcripts && Array.isArray(data.media.transcripts)) {
						console.log('✅ Step 5: Found media.transcripts array, length:', data.media.transcripts.length);
						const transcript = data.media.transcripts[0];
						if (transcript && transcript.temporaryDownloadUrl) {
							console.log('✅ Step 6: Found temporaryDownloadUrl:', transcript.temporaryDownloadUrl);
							try {
								// Fetch the actual transcript content
								console.log('🌐 Step 7: Fetching transcript content...');
								const transcriptResponse = await originalFetch(transcript.temporaryDownloadUrl);
								console.log('✅ Step 8: Got transcript response, status:', transcriptResponse.status);
								
								// Get response as array buffer to detect format
								const transcriptBuffer = await transcriptResponse.arrayBuffer();
								const transcriptBytes = new Uint8Array(transcriptBuffer);
								
								// Check for gzip magic number
								const isTranscriptGzipped = transcriptBytes.length > 2 && transcriptBytes[0] === 0x1f && transcriptBytes[1] === 0x8b;
								const transcriptEncoding = transcriptResponse.headers.get('content-encoding');
								
								console.log('📦 Step 9: Transcript format detection:', {
									isGzipped: isTranscriptGzipped,
									contentEncoding: transcriptEncoding,
									firstBytes: Array.from(transcriptBytes.slice(0, 10)).map(b => '0x' + b.toString(16)).join(' ')
								});
								
								let transcriptText = '';
								
								// Handle gzip compressed responses (by header or magic number)
								if (transcriptEncoding === 'gzip' || transcriptEncoding === 'deflate' || isTranscriptGzipped) {
									console.log('🗜️ Step 10a: Transcript is compressed, decompressing...');
									try {
										const blob = new Blob([transcriptBuffer]);
										console.log('🗜️ Step 10b: Got transcript blob, size:', blob.size);
										const ds = new DecompressionStream('gzip');
										const decompressedStream = blob.stream().pipeThrough(ds);
										const decompressedBlob = await new Response(decompressedStream).blob();
										console.log('🗜️ Step 10c: Decompressed blob, size:', decompressedBlob.size);
										transcriptText = await decompressedBlob.text();
										console.log('✅ Step 10d: Transcript decompression successful, text length:', transcriptText.length);
									} catch (decompressErr) {
										console.error('❌ Step 10 - Transcript decompression failed:', decompressErr);
										console.error('❌ Error stack:', decompressErr.stack);
										throw decompressErr;
									}
								} else {
									// Not compressed, decode as text
									console.log('📄 Step 10a: Transcript is not compressed, decoding as text');
									transcriptText = new TextDecoder().decode(transcriptBuffer);
									console.log('✅ Step 10b: Got transcript text, length:', transcriptText.length);
								}
								
								console.log('📝 Step 11: Transcript text sample:', transcriptText.substring(0, 200));
								
								// Check if it's WebVTT format
								if (transcriptText.trim().startsWith('WEBVTT')) {
									console.log('Detected WebVTT format, parsing...');
									
									// Parse WebVTT format - extract text only, skip speaker tags
									const lines = [];
									const vttLines = transcriptText.split('\n');
									let i = 0;
									
									while (i < vttLines.length) {
										const line = vttLines[i].trim();
										
										// Look for timestamp lines (format: 00:00:04.000 --> 00:00:08.000)
										if (line.includes('-->')) {
											i++; // Move to text line(s)
											
											// Collect all text lines for this timestamp block (until blank line or next timestamp)
											const textLines = [];
											while (i < vttLines.length && vttLines[i].trim() !== '' && !vttLines[i].includes('-->')) {
												textLines.push(vttLines[i].trim());
												i++;
											}
											
											if (textLines.length > 0) {
												let fullText = textLines.join(' ');
												// Remove speaker tags if present
												fullText = fullText.replace(/<v\s+[^>]+>/g, '').replace(/<\/v>/g, '').trim();
												if (fullText) {
													lines.push(fullText);
												}
											}
											continue;
										}
										i++;
									}
									
									parsedText = lines.join('\n').trim();
								} else {
									// Try parsing as JSON
									try {
										const transcriptData = JSON.parse(transcriptText);
										
										if (transcriptData.recognizedPhrases && Array.isArray(transcriptData.recognizedPhrases)) {
											const lines = [];
											transcriptData.recognizedPhrases.forEach(phrase => {
												if (phrase.nBest && phrase.nBest[0]) {
													lines.push(phrase.nBest[0].display);
												}
											});
											parsedText = lines.join('\n').trim();
										} else if (transcriptData.entries && Array.isArray(transcriptData.entries)) {
											const lines = [];
											transcriptData.entries.forEach(entry => {
												const text = entry.text || '';
												if (text) {
													lines.push(text);
												}
											});
											parsedText = lines.join('\n').trim();
										} else {
											// If we can't parse structure, use the raw text
											parsedText = transcriptText;
										}
									} catch (parseErr) {
										console.warn('Failed to parse as JSON, using raw text:', parseErr);
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
				} catch (err) {
					console.error('Error extracting transcript:', err);
				}
			})();
		}

		return response;
	};
})();
