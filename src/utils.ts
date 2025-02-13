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
