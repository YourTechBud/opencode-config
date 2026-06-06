export interface TaskParams {
	agent: string;
	description: string;
	prompt: string;
}

// Minimal TypeBox-compatible JSON schema. Pi's tool layer consumes the JSON-schema
// shape at runtime; avoiding an external typebox dependency keeps this project
// extension self-contained.
export const taskParameters = {
	type: "object",
	properties: {
		agent: { type: "string", description: "Name of the sub-agent to run." },
		description: { type: "string", description: "Short UI label for this delegated task." },
		prompt: { type: "string", description: "Complete instructions and context for the sub-agent." },
	},
	required: ["agent", "description", "prompt"],
	additionalProperties: false,
} as const;
