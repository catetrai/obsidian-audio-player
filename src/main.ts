import {
	getLinkpath,
	MarkdownPostProcessorContext,
	Notice,
	Plugin,
	resolveSubpath,
	TFile,
} from "obsidian";

import { AudioPlayerRenderer } from "./audioPlayerRenderer";
import {
	lrcToCommentList,
	parseLrc,
	parseSrt,
	parseTimestamp,
	secondsToString,
	srtToCommentList
} from "./utils";


export default class AudioPlayer extends Plugin {
	async onload() {
		const player = document.createElement("audio");
		player.volume = 0.5;
		const body = document.getElementsByTagName("body")[0];
		body.appendChild(player);

		this.addCommand({
			id: "pause-audio",
			name: "Pause audio",
			callback: () => {
				new Notice("Audio paused");
				const ev = new Event("allpause");
				document.dispatchEvent(ev);
				player.pause();
			},
		});

		this.addCommand({
			id: "resume-audio",
			name: "Resume audio",
			callback: () => {
				new Notice("Audio resumed");
				const ev = new Event("allresume");
				document.dispatchEvent(ev);
				if (player.src) player.play();
			},
		});

		this.addCommand({
			id: "toggle-audio",
			name: "Toggle play/pause",
			callback: () => {
				if (player.src && player.paused) {
					const ev = new Event("allresume");
					document.dispatchEvent(ev);
					player.play();
				} else {
					const ev = new Event("allpause");
					document.dispatchEvent(ev);
					player.pause();
				}
			},
		});

		this.addCommand({
			id: "toggle-looping",
			name: "Toggle looping of current track",
			callback: () => {
				const ev = new Event("looptoggle");
				document.dispatchEvent(ev);
			}
		});

		this.addCommand({
			id: "copy-timestamp",
			name: "Copy current timestamp to clipboard",
			callback: () => {
				navigator.clipboard.writeText(secondsToString(player.currentTime));
				new Notice("Copied current timestamp");
			}
		});
		
		this.addCommand({
			id: "toggle-and-copy-timestamp",
			name: "Toggle play/pause and copy current timestamp",
			callback: () => {
				if (player.src && player.paused) {
					const ev = new Event("allresume");
					document.dispatchEvent(ev);
					player.play();	
				} else {
					const ev = new Event("allpause");
					document.dispatchEvent(ev);
					player.pause();
					navigator.clipboard.writeText(secondsToString(player.currentTime));
					new Notice("Copied current timestamp");
				}
			}
		});

		this.addCommand({
			id: "audio-forward-5s",
			name: "Skip +5 sec",
			callback: () => {
				if (player.src) player.currentTime += 5;
			}
		});

		this.addCommand({
			id: "audio-back-5s",
			name: "Skip -5 sec",
			callback: () => {
				if (player.src) player.currentTime -= 5;
			}
		});

		this.addCommand({
			id: "audio-skip-back-beginning",
			name: "Skip back to beginning",
			callback: () => {
				if (player.src) player.currentTime = 0;
			}
		});

		// Treat subtitle/lyrics files as Markdown files that can be
		// opened in the viewer and editor
		this.registerExtensions(['lrc', 'srt', 'vtt'], 'markdown');

		// Register global handlers for timestamp links click and hover
		this.registerDomEvent(document, 'click', (event: MouseEvent) => {
			this.handleTimestampClick(event);
		});
		this.registerDomEvent(document, 'mouseover', (event: MouseEvent) => {
			this.handleTimestampMouseover(event);
		});
		this.registerDomEvent(document, 'mouseout', (event: MouseEvent) => {
			// Delete the cookie immediately on mouseout, to minimize
			// likelihood that it will be ingested by a player different
			// from the hover target
			localStorage.removeItem('musicPlayerSeek');
		});

		// Create audio player container from rendered HTML
		this.registerMarkdownPostProcessor(
			(
				el: HTMLElement,
				ctx: MarkdownPostProcessorContext
			) => {
			const callouts = el.findAll('.callout[data-callout="music-player"]');

			for (const callout of callouts) {
				const calloutContent = callout.find('.callout-content');
				
				// Parse file name
				const filename = calloutContent.find('p > a').getAttribute('href');
				if (!filename) return;

				const allowedExtensions = [
					"mp3",
					"wav",
					"ogg",
					"flac",
					"mp4",
					"m4a",
					"webm"
				];
				const link = this.app.metadataCache.getFirstLinkpathDest(
					getLinkpath(filename),
					filename
				);
				if (!link || !allowedExtensions.includes(link.extension))
					return;
				
				// Parse title (if none, use file name)
				let calloutTitle = callout.find('.callout-title').innerText;
				if (!calloutTitle || calloutTitle == 'Music player')
					calloutTitle = link.basename;

				// Parse moodbar image (must be embedded image link)
				const moodbar = calloutContent.find('p > span.internal-embed') || null;

				// Parse optional internal link to a vault file from which comments
				// should be sourced.
				// If a source is provided, any comments entered in the callout
				// will be ignored.
				//
				// Supported file types / extensions:
				// - Subtitles: .srt, .vtt
				// - Lyrics: .lrc

				const externalFileLink = calloutContent.find(
					'p > a.internal-link[href$=".srt" i],' +
					'p > a.internal-link[href$=".vtt" i],' +
					'p > a.internal-link[href$=".lrc" i]'
				);

				// Create root HTML element
				const container = el.createDiv();
				container.classList.add("base-container");

				// If external subtitle file is linked, overwrite hardcoded comments
				if ( externalFileLink ) {
					// Read subtitle SRT/VTT file
					const externalFilePath = externalFileLink.getAttr('href') || ''
					const externalFile = this.app.metadataCache.getFirstLinkpathDest(
						getLinkpath(externalFilePath),
						externalFilePath
					) as TFile;
					this.app.vault.cachedRead(externalFile).then((s: string) => {
						const externalFileExt = externalFile?.extension.toLowerCase() || '';
						const func = externalFileExt == 'lrc' ? lrcToCommentList : srtToCommentList;
						const commentsList = func(externalFileLink, s);
						// Create vue app
						ctx.addChild(
							new AudioPlayerRenderer(el, {
								filepath: link.path,
								title: calloutTitle,
								content: commentsList,
								moodbar: moodbar,
								ctx,
								player,
							})
						);
					});
				} else {
					// Parse comments entered in the callout block
					// in one of possible accepted formats:
						
					// 1. Plugin-specific format (unordered list)
					let commentsList = calloutContent.find('ul');
					
					if (!commentsList) {
						const text = calloutContent.findAll('p')
							.map((e) => e.innerText)
							.join('\n\n');

						// 2. SRT/VTT format
						if (parseSrt(text).length) {
							commentsList = srtToCommentList(calloutContent, text);
						// 3. LRC format
						} else if (parseLrc(text).length) {
							commentsList = lrcToCommentList(calloutContent, text);
						}
					}
					// Create vue app
					ctx.addChild(
						new AudioPlayerRenderer(el, {
							filepath: link.path,
							title: calloutTitle,
							content: commentsList,
							moodbar: moodbar,
							ctx,
							player,
						})
					);
				}
			}
		});
	}

	private handleTimestampClick(event: MouseEvent) {
		const target = event.target as HTMLElement;
		if (!target) return;

		// Check if clicked element is a link
		const link = target.closest('a[href]')
			|| (target.tagName === 'A' ? target : null) as HTMLAnchorElement;
		if (!link) return;

		// Get the link text and check if it matches a timestamp pattern
		const linkText = link.textContent || '';
		const timeInSeconds = parseTimestamp(linkText);
		const linkTarget = link.getAttr('data-href');

		if (timeInSeconds) {
			event.preventDefault();
			event.stopPropagation();
			
			if (linkTarget) {
				const [ linkedPage, linkedSubpath ] = linkTarget.split('#');
				const currentFile = this.app.workspace.getActiveFile();
				const currentPage = currentFile?.path;
				const targetPage = this.app.metadataCache.getFirstLinkpathDest(linkedPage, currentPage || '');
				if ( currentPage && targetPage ) {
					const cache = this.app.metadataCache.getFileCache(targetPage);
					if (cache) {
						const resolvedBlock = resolveSubpath(cache, linkedSubpath);
						
						if (resolvedBlock && resolvedBlock.type == 'block') {
							// Start and end line of Markdown block
							const lineStart = resolvedBlock.block.position.start.line;
							const lineEnd = resolvedBlock.block.position.end.line;

							// If link is on same page as player (therefore, component is
							// already loaded), dispatch custom event on player HTMLElement
							if ( targetPage == currentFile ) {
							// if (linkedPage == '') {
								const audioPlayerElements = document
									.querySelectorAll('.audio-player-ui') as NodeListOf<HTMLElement>;
								audioPlayerElements.forEach((e) => {
									const seekEvent = new CustomEvent('seek-to-timestamp', {
										detail: { lineStart, lineEnd, timeInSeconds },
										bubbles: true
									});
									e.dispatchEvent(seekEvent);
								});
							} else {
								// Store seek time as cookie to be ingested by players
								// on other pages (not in DOM of current document)
								localStorage.setItem(
									'musicPlayerSeek',
									`${lineStart}:${lineEnd}:${timeInSeconds}`
								);
							}
						}
					}
				}
			}
		}
	}

	private handleTimestampMouseover(event: MouseEvent) {
		const target = event.target as HTMLElement;
		if (!target) return;

		// Check if hovered element is a link
		const link = target.closest('a[href]')
			|| (target.tagName === 'A' ? target : null) as HTMLAnchorElement;
		if (!link) return;

		// Get the link text and check if it matches a timestamp pattern
		const linkText = link.textContent || '';
		const timeInSeconds = parseTimestamp(linkText);
		if (timeInSeconds) {
			event.preventDefault();
			event.stopPropagation();
			
			// Store seek time as cookie to be accessed by the player
			// rendered in popup preview when hovering on the link.
			// Since the popup contains only the single linked player,
			// we do not need to select a specific block, so we leave
			// `lineStart` and `lineEnd` empty.
			const [ lineStart, lineEnd ] = ['', ''];
			localStorage.setItem(
				'musicPlayerSeek',
				`${lineStart}:${lineEnd}:${timeInSeconds}`
			);
		}
	}
}
