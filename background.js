// Service Worker for debugging and monitoring
console.log('Service Worker loaded');

chrome.runtime.onInstalled.addListener(() => {
	console.log('Extension installed or updated');
});
