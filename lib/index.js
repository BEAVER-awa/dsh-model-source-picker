/**
 * Model Source Picker — host half.
 *
 * Intentionally empty: the whole feature lives in the client half
 * (lib/client.js), which takes over the `conversation.input.model` seat and
 * only needs client services (`slots`, `modelDirectories`). Nothing here
 * touches the agent loop, tools or prompts.
 */
export const name = 'dsh-model-source-picker'

export function apply () {}
