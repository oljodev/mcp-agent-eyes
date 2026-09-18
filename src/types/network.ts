/** Network mocking and response-wait types. */

export const MOCK_ACTIONS = ["add", "clear", "list"] as const;
export type MockAction = (typeof MOCK_ACTIONS)[number];

/** A stubbed network route, replayed onto every context (survives crashes). */
export interface MockRoute {
  pattern: string;
  status: number;
  contentType: string;
  body: string;
  headers?: Record<string, string> | undefined;
}

/** Arguments accepted by mock_route. */
export interface MockRouteInput {
  action: MockAction;
  pattern?: string | undefined;
  status: number;
  contentType: string;
  body?: string | undefined;
  headers?: Record<string, string> | undefined;
}

/** Max characters of a response body snippet returned by wait_for_response. */
export const RESPONSE_BODY_SNIPPET_MAX = 2000;
