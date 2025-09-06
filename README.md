# Obsidian Music Player

This is a fork of the wonderful [noonesimg/obsidian-audio-player](https://github.com/noonesimg/obsidian-audio-player). It's tweaked to better fit the use case of annotating specifically music files, rather than long audios like podcasts, though it can be used for both.

## Features

- Audio player with wave visualization
- Easy to insert in your note as a custom callout block
- Add formatted comments to timestamps or time windows with millisecond resolution
- Click on comment to jump to time in audio player
- Copy current timestamp to clipboard
- One audio instance for the whole Obsidian vault
- Keeps playing even if you've closed the tab

## Demo

https://github.com/user-attachments/assets/a2645be9-a747-4e1f-9bf4-3d8dc12e6261

## How to use

In your note, create a [callout](https://help.obsidian.md/Editing+and+formatting/Callouts) of type `music-player`:

```
> [!music-player]
> [[my_audio_file.mp3]]
```

The audio file must be supplied as an internal link. The link must be on the first line of the callout text.

By default, the file name will be displayed as title of the player widget. You can override this by optionally specifying a callout title:

```
> [!music-player] Song Title
> [[my_audio_file.mp3]]
```

### Commands

The following commands are accessible through the command palette menu (`Ctrl+P` or `Cmd+P`):

- **Pause Audio**: pause whatever audio is playing
- **Resume Audio**: resume currently playing audio
- **Toggle Audio**: switch between pause and resume
- **-5 sec** / **+5 sec**: skip to 5 seconds back or forward in the audio
- **Copy current timestamp to clipboard**: same as clicking on the current timestamp on the player
- **Play/pause and copy current timestamp**: copies timestamp when pausing audio

It's highly recommended to configure hotkeys for these commands. This will significantly speed up your workflow when writing comments while listening to the song, which involves a lot of play-pause, going backwards to pause just at the right time, and copy-pasting the current timestamp.

### Add comments with timestamps

#### Manually add comments

In edit mode, you can add comment entries with timestamps inside the callout block.

The following formats for audio comments are supported:
1. Native format (see below)
2. [SubRip subtitle format](https://en.wikipedia.org/wiki/SubRip#Format) (`.srt`)
3. [WebVTT subtitle format](https://en.wikipedia.org/wiki/WebVTT) (`.vtt`)
4. [LRC lyrics file format](https://en.wikipedia.org/wiki/LRC_(file_format)) (`.lrc`)

##### Native format

Comments are entered as an unordered list, with the time indication and the comment text separated by `---`.

Times can be specified either as single timestamps or as time windows with start and end time. The timestamp format is `mm:ss.SSS` (milliseconds are optional).

```
> [!music-player] Song Title
> [[my_audio_file.mp3]]
>
> - 01:50.123 --- comment with _Markdown_ **formatting**
> - 02:01.456-12:38 --- comment on a time window
> - 02:40 --- comment with an [[My Note|internal link]]
```

:bulb: To grab the current timestamp to be pasted in the block, just click on the current time on the player, or run the command **Copy current timestamp to clipboard** (easiest via hotkey).

#### Import comments from file

Comments can otherwise be sourced from a linked file within the vault (via internal link). The following file formats/extensions are supported:
- `.srt`
- `.vtt`
- `.lrc`

Example:

```
> [!music-player] Song Title
> [[my_audio_file.mp3]]
> [[my_subtitle_file.srt]]
```

If a file link is provided as comments source, any comments entered in the callout block will be ignored.

### Link to player timestamp

To link to a specific timestamp on an audio player, use an Obsidian [internal link to the callout block](https://help.obsidian.md/links#Link+to+a+block+in+a+note) with the timestamp as link display text:

```markdown
[[My Page#^block-id|01:23.045]]
```

### Display moodbar

The [Moodbar](https://en.wikipedia.org/wiki/Moodbar) is a great visual aid to find at a glance the different sections of a song, nicely complementing your manual annotations. [See here an example of how to generate a moodbar](https://www.hackitu.de/pymood/).

If you have a moodbar of your audio track saved as image in your vault, you can display it on the music player below the waveform:

<img width="593" alt="Screenshot 2025-02-19 at 19 16 14" src="https://github.com/user-attachments/assets/e0fb71b1-9eac-4775-b5b0-d769fd0eac9a" />

In the callout, just add an [image embed](https://help.obsidian.md/Linking+notes+and+files/Embed+files#Embed%20an%20image%20in%20a%20note):

```
> [!music-player]
> [[my_audio_file.mp3]]
> ![[moodbar.png]]
```


## How to install

### Manually

1. Quit Obsidian
2. Go to the latest release under [Releases](https://github.com/catetrai/obsidian-audio-player/releases)
3. Download the assets `main.js`, `manifest.json` and `styles.css`
4. In your vault, under `.obsidian` create a subfolder `music-player`
5. Move the 3 asset files into `music-player`
6. Open Obsidian
7. Go to Settings -> Community Plugins
8. Scroll down, find "Music Player" plugin and enable it
9. Quit and reopen Obsidian

### Using Git (for development)

If you want to play around with the source code (assuming you have a development environment set up with Node), install the plugin from the repository:

1. Quit Obsidian
2. Clone this repository into your vault's `.obsidian/plugins` directory
3. Run `npm install` and `npm run dev`
4. Open Obsidian
5. Go to Settings -> Community Plugins
6. Scroll down, find "Music Player" plugin and enable it
7. Quit and reopen Obsidian
