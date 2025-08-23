export function secondsToString(num: number) {
	const minutes = String(Math.floor(num / 60)).padStart(2, '0');
	const secondsWithMillis = (num % 60).toFixed(3).split('.');
	const seconds = secondsWithMillis[0].padStart(2, '0');
	const millis = secondsWithMillis[1];

	return `${minutes}:${seconds}.${millis}`;
}

export function secondsToNumber(stmp: string): number {
	const nums = stmp.split(':').map((x) => Number.parseFloat(x));
	return nums[1] + nums[0] * 60;
}

export function range(a: number, b: number): number[] {
	// Array of integers between and including a and b, with a <= b
	return Array.from({length: b - a + 1}, (_, i) => a + i) as number[];
}

export function hasOverlap(a: number[], b: number[]) {
	// Calculate if two windows [tStart, tEnd] overlap
	return b[0] < a[0] ? b[1] >= a[0] : b[0] <= a[1];
}

export function lrcToCommentList(el: HTMLElement, lrcText: string): HTMLElement {
	const lrcItems = parseLrc(lrcText);
	const list = el.createEl('ul');
	lrcItems.forEach((l) => {
		list.createEl('li', { text: `${l[0]} --- ${l[1]}` })
	});
	return list;
}

export function srtToCommentList(el: HTMLElement, srtText: string): HTMLElement {
	const lrcItems = parseSrt(srtText);
	const list = el.createEl('ul');
	lrcItems.forEach((l) => {
		list.createEl('li', { text: `${l[0]}-${l[1]} --- ${l[2]}` })
	});
	return list;
}

export function parseLrc(lrc: string): Array<Array<string>> {
	/*
		Parse .lrc file contents

		```
		Example:
		[00:17.02] All I wanna do when I wake up in the morning is see your eyes
		[00:22.22] Rosanna, Rosanna
		```

	 	Output is list of tuples [time, text]
	*/
    const lrcEntries = [] as Array<Array<string>>;
	
    lrc.split('\n').forEach(line => {
        const match = line.match(/^\[(?<time>\d{2}:\d{2}(.\d{2})?)\](?<text>.*)/);
        if (match == null) return;
        const { time, text } = match.groups;
        lrcEntries.push([ parseTime(time), text.trim() ]);
    });

    function parseTime(time: string): string{
		if (time.split('.')[1].length == 2) {
			// Convert hundreds of a second to milliseconds
			return time + '0';
		}
		return time;
    }

    return lrcEntries;
}

export function parseSrt(srt: string): Array<Array<string>> {
	/*
		Parse .srt and .vtt file contents

		Example:

		```
		1
		00:00:00,002 --> 00:00:02,669
		(upbeat music)

		2
		00:00:17,198 --> 00:00:19,634
		♪ All I wanna do when I
		wake up in the morning ♪
		```
		
		Output is list of tuples [startTime, endTime, text]
	 */
    const srtEntries = [] as Array<Array<string>>;
	
    srt.trim().split("\n\n").forEach(entry => {
		let sections = entry.split('\n');
		if (sections[0].match(/^\d+$/)) sections = sections.slice(1);
		if (sections.length < 2) return;
		const timeStr = sections[0];
        const match = timeStr.match(/^(?<startTime>\d{2}:\d{2}:\d{2}([,.]\d{3})?) --> (?<endTime>\d{2}:\d{2}:\d{2}([,.]\d{3})?)/);
		if (match == null) return;
        const { startTime, endTime } = match.groups;
		const text = sections.slice(1).join('\n');
        srtEntries.push([ parseTime(startTime), parseTime(endTime), text.trim() ]);
    });

    function parseTime(time: string): string{
		return time.split(':').slice(1).join(':').replace(',', '.');
    }
    return srtEntries;
}