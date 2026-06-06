import { CustomEditor, type ExtensionAPI } from "@earendil-works/pi-coding-agent";

const BRACKETED_PASTE_START = "\x1b[200~";
const BRACKETED_PASTE_END = "\x1b[201~";

class ShowPastedContentEditor extends CustomEditor {
	private isPasting = false;
	private pasteBuffer = "";

	override handleInput(data: string): void {
		if (data.startsWith(BRACKETED_PASTE_START)) {
			this.isPasting = true;
			this.pasteBuffer = data.slice(BRACKETED_PASTE_START.length);
			this.flushPasteIfComplete();
			return;
		}

		if (this.isPasting) {
			this.pasteBuffer += data;
			this.flushPasteIfComplete();
			return;
		}

		super.handleInput(data);
	}

	private flushPasteIfComplete(): void {
		const endIndex = this.pasteBuffer.indexOf(BRACKETED_PASTE_END);
		if (endIndex === -1) return;

		const pastedContent = this.pasteBuffer.slice(0, endIndex);
		const remaining = this.pasteBuffer.slice(endIndex + BRACKETED_PASTE_END.length);

		this.isPasting = false;
		this.pasteBuffer = "";

		const cleaned = this.cleanPastedText(pastedContent);
		if (cleaned.length > 0) {
			this.insertTextAtCursor(cleaned);
		}

		if (remaining.length > 0) {
			this.handleInput(remaining);
		}
	}

	private cleanPastedText(pastedText: string): string {
		// Some terminals re-encode control bytes inside bracketed paste as
		// CSI-u Ctrl+<letter> sequences. Decode them the same way pi's default
		// editor does before filtering control characters.
		const decodedText = pastedText.replace(/\x1b\[(\d+);5u/g, (match, code: string) => {
			const cp = Number(code);
			if (cp >= 97 && cp <= 122) return String.fromCharCode(cp - 96);
			if (cp >= 65 && cp <= 90) return String.fromCharCode(cp - 64);
			return match;
		});

		return decodedText
			.replace(/\r\n/g, "\n")
			.replace(/\r/g, "\n")
			.replace(/\t/g, "    ")
			.split("")
			.filter((char) => char === "\n" || char.charCodeAt(0) >= 32)
			.join("");
	}
}

export default function (pi: ExtensionAPI) {
	pi.on("session_start", (_event, ctx) => {
		ctx.ui.setEditorComponent((tui, theme, keybindings) =>
			new ShowPastedContentEditor(tui, theme, keybindings),
		);
	});
}
