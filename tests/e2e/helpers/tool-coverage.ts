/**
 * Which spec covers which tool.
 *
 * tool-coverage.e2e.test.ts compares this against the tools the server actually
 * registers, so a newly registered tool fails the suite until it has a spec.
 */
export const TOOL_COVERAGE: Record<string, string> = {
  browser_tab_group: "tabs.e2e.test.ts",
  browser_tabs: "tabs.e2e.test.ts",
  browser_close: "tabs.e2e.test.ts",

  browser_snapshot: "snapshot.e2e.test.ts",
  browser_find: "snapshot.e2e.test.ts",

  browser_click: "interactions.e2e.test.ts",
  browser_hover: "interactions.e2e.test.ts",
  browser_type: "interactions.e2e.test.ts",
  browser_press_key: "interactions.e2e.test.ts",
  browser_fill_form: "interactions.e2e.test.ts",
  browser_select_option: "interactions.e2e.test.ts",
  browser_wait_for: "interactions.e2e.test.ts",

  browser_evaluate: "scripting.e2e.test.ts",
  browser_run_code_unsafe: "scripting.e2e.test.ts",

  browser_network_requests: "network.e2e.test.ts",
  browser_network_request: "network.e2e.test.ts",
  browser_network_response_body: "network.e2e.test.ts",

  browser_console_messages: "diagnostics.e2e.test.ts",
  browser_page_errors: "diagnostics.e2e.test.ts",

  browser_handle_dialog: "dialogs.e2e.test.ts",

  browser_file_upload: "files-drag-drop.e2e.test.ts",
  browser_drop: "files-drag-drop.e2e.test.ts",
  browser_drag: "files-drag-drop.e2e.test.ts",

  browser_resize: "viewport.e2e.test.ts",
  browser_screenshot: "viewport.e2e.test.ts",

  browser_navigate: "navigation.e2e.test.ts",
  browser_navigate_back: "navigation.e2e.test.ts",

  browser_checkpoint: "checkpoints.e2e.test.ts",
  browser_checkpoint_report: "checkpoints.e2e.test.ts",
};
