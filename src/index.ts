#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";

const API_BASE = "https://api.earthclassmail.com/v1";

interface ApiResponse<T> {
  data?: T[];
  current_page?: number;
  last_page?: number;
  total?: number;
  error?: { message: string };
}

interface Inbox {
  id: number;
  created_at: string;
  updated_at: string;
  account?: {
    id: number;
    name: string;
    account_status: string;
  };
  piece_counts: {
    total_piece_count: number;
    unread_piece_count: number;
    scanned_piece_count: number;
    unscanned_piece_count: number;
  };
}

interface MailPiece {
  id: number;
  created_at: string;
  received_at: string;
  inbox_id: number;
  barcode: string;
  piece_type: string;
  piece_sub_type: string;
  attributes: string[];
  available_actions: string[];
  carrier?: { name: string; class: string };
  sender?: { name: string; address?: string };
  recipient?: { id: number; name: string };
  page_count_actual?: number;
  weight_in_ounces?: number;
  media?: Array<{
    url: string;
    content_type: string;
    tags: string[];
  }>;
  operation_status?: string;
  operation_action?: string;
  ocr_data?: string;
}

interface Recipient {
  id: number;
  name: string;
  type: string;
  ecm_number: string;
  piece_counts: {
    total_piece_count: number;
    unread_piece_count: number;
  };
}

interface User {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  username: string;
}

// Summarize a mail piece by removing large fields like media URLs
function summarizePiece(piece: MailPiece): object {
  return {
    id: piece.id,
    received_at: piece.received_at,
    piece_type: piece.piece_type,
    piece_sub_type: piece.piece_sub_type,
    sender: piece.sender?.name || "Unknown",
    recipient: piece.recipient?.name || "Unknown",
    attributes: piece.attributes,
    available_actions: piece.available_actions,
    page_count: piece.page_count_actual,
    has_media: (piece.media?.length || 0) > 0,
    operation_status: piece.operation_status,
  };
}

class EarthClassMailClient {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers: {
        "x-api-key": this.apiKey,
        "Accept": "application/json",
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error?.message || `API error: ${response.status}`);
    }

    return response.json();
  }

  async getUser(): Promise<User> {
    return this.request<User>("/user");
  }

  async listInboxes(): Promise<ApiResponse<Inbox>> {
    return this.request<ApiResponse<Inbox>>("/inboxes");
  }

  async getInbox(inboxId: number): Promise<Inbox> {
    return this.request<Inbox>(`/inboxes/${inboxId}`);
  }

  async listPieces(inboxId: number, options?: {
    page?: number;
    per_page?: number;
    sort?: string;
    unread_only?: boolean;
  }): Promise<ApiResponse<MailPiece>> {
    const params = new URLSearchParams();
    if (options?.page) params.set("page", String(options.page));
    if (options?.per_page) params.set("per_page", String(options.per_page));
    if (options?.sort) params.set("sort", options.sort);
    if (options?.unread_only) params.set("attributes[]", "unread");

    const query = params.toString();
    return this.request<ApiResponse<MailPiece>>(
      `/inboxes/${inboxId}/pieces${query ? `?${query}` : ""}`
    );
  }

  async getPiece(pieceId: number | string): Promise<MailPiece> {
    // Single piece endpoint doesn't use inbox prefix
    return this.request<MailPiece>(`/pieces/${pieceId}`);
  }

  async listRecipients(inboxId: number): Promise<ApiResponse<Recipient>> {
    return this.request<ApiResponse<Recipient>>(`/inboxes/${inboxId}/recipients`);
  }

  async performAction(pieceId: number, action: string): Promise<unknown> {
    // Map action names to API endpoint format
    // API uses /pieces/{id}/{action} format with shortened action names
    const actionMap: Record<string, string> = {
      "move-to-archive": "archive",
      "move-to-trash": "trash",
      "move-to-inbox": "inbox",
      "send-to-cloud": "cloud",
      "send-to-email": "email",
      // These actions use their name directly
      "scan": "scan",
      "shred": "shred",
      "ship": "ship",
      "archive": "archive",
      "trash": "trash",
      "inbox": "inbox",
    };
    const endpoint = actionMap[action] || action;
    return this.request(`/pieces/${pieceId}/${endpoint}`, {
      method: "POST",
    });
  }

  async fetchMediaContent(url: string): Promise<{ data: string; contentType: string }> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch media: ${response.status}`);
    }
    const buffer = await response.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");
    const contentType = response.headers.get("content-type") || "application/octet-stream";
    return { data: base64, contentType };
  }
}

const TOOLS: Tool[] = [
  {
    name: "ecm_get_user",
    description: "Get the current Earth Class Mail user profile information",
    inputSchema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "ecm_list_inboxes",
    description: "List all mailbox inboxes in your Earth Class Mail account with piece counts",
    inputSchema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "ecm_get_inbox",
    description: "Get details for a specific inbox including account info and piece counts",
    inputSchema: {
      type: "object" as const,
      properties: {
        inbox_id: {
          type: "number",
          description: "The inbox ID to retrieve",
        },
      },
      required: ["inbox_id"],
    },
  },
  {
    name: "ecm_list_pieces",
    description: "List mail pieces in an inbox. Returns a summary of each piece (use ecm_get_piece for full details including media URLs).",
    inputSchema: {
      type: "object" as const,
      properties: {
        inbox_id: {
          type: "number",
          description: "The inbox ID to list pieces from",
        },
        page: {
          type: "number",
          description: "Page number (default: 1)",
        },
        per_page: {
          type: "number",
          description: "Items per page (default: 10, max: 50 to avoid token limits)",
        },
        unread_only: {
          type: "boolean",
          description: "Only return unread pieces",
        },
      },
      required: ["inbox_id"],
    },
  },
  {
    name: "ecm_get_piece",
    description: "Get detailed information about a specific mail piece including scanned content URLs",
    inputSchema: {
      type: "object" as const,
      properties: {
        piece_id: {
          type: "number",
          description: "The piece ID to retrieve",
        },
        include_media: {
          type: "boolean",
          description: "Include full media URLs (default: false, they are very long). Set to true only if you need to access the scanned images.",
        },
      },
      required: ["piece_id"],
    },
  },
  {
    name: "ecm_list_recipients",
    description: "List all recipients (names on your mailbox) for an inbox",
    inputSchema: {
      type: "object" as const,
      properties: {
        inbox_id: {
          type: "number",
          description: "The inbox ID to list recipients for",
        },
      },
      required: ["inbox_id"],
    },
  },
  {
    name: "ecm_perform_action",
    description: "Perform an action on a mail piece. Working actions: scan, shred, ship, archive. Note: move-to-inbox and some other actions may not be available via API.",
    inputSchema: {
      type: "object" as const,
      properties: {
        piece_id: {
          type: "number",
          description: "The piece ID to perform action on",
        },
        action: {
          type: "string",
          description: "The action to perform. Note: not all actions may be available via API.",
          enum: ["scan", "shred", "ship", "archive"],
        },
      },
      required: ["piece_id", "action"],
    },
  },
  {
    name: "ecm_get_piece_content",
    description: "Get content from a mail piece. NOTE: ECM API only provides envelope images, not scanned document pages. For full scanned content, use OCR text from ecm_get_piece or use send-to-email action.",
    inputSchema: {
      type: "object" as const,
      properties: {
        piece_id: {
          type: "number",
          description: "The piece ID to get content for",
        },
        include_ocr: {
          type: "boolean",
          description: "Include OCR text from scanned pages (default: true)",
        },
      },
      required: ["piece_id"],
    },
  },
];

async function main() {
  const apiKey = process.env.EARTHCLASSMAIL_API_KEY;

  if (!apiKey) {
    console.error("Error: EARTHCLASSMAIL_API_KEY environment variable is required");
    console.error("Get your API key from: Earth Class Mail → Settings → Integrations → Generate Key");
    process.exit(1);
  }

  const client = new EarthClassMailClient(apiKey);

  const server = new Server(
    {
      name: "earthclassmail-mcp",
      version: "1.0.9",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS,
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case "ecm_get_user": {
          const user = await client.getUser();
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(user, null, 2),
              },
            ],
          };
        }

        case "ecm_list_inboxes": {
          const inboxes = await client.listInboxes();
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(inboxes, null, 2),
              },
            ],
          };
        }

        case "ecm_get_inbox": {
          const inbox = await client.getInbox(args?.inbox_id as number);
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(inbox, null, 2),
              },
            ],
          };
        }

        case "ecm_list_pieces": {
          // Cap per_page at 50 to avoid token limits
          const perPage = Math.min((args?.per_page as number) || 10, 50);
          const pieces = await client.listPieces(args?.inbox_id as number, {
            page: args?.page as number | undefined,
            per_page: perPage,
            unread_only: args?.unread_only as boolean | undefined,
          });

          // Return summarized pieces to reduce token usage
          const summarized = {
            current_page: pieces.current_page,
            last_page: pieces.last_page,
            total: pieces.total,
            data: pieces.data?.map(summarizePiece),
          };

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(summarized, null, 2),
              },
            ],
          };
        }

        case "ecm_get_piece": {
          const piece = await client.getPiece(
            args?.piece_id as number
          );

          // Optionally strip media URLs (they're very long due to AWS signatures)
          const includeMedia = args?.include_media as boolean;
          if (!includeMedia && piece.media) {
            const result = {
              ...piece,
              media: piece.media.map(m => ({
                content_type: m.content_type,
                tags: m.tags,
                url: "[URL available - set include_media=true to see]",
              })),
            };
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(piece, null, 2),
              },
            ],
          };
        }

        case "ecm_list_recipients": {
          const recipients = await client.listRecipients(args?.inbox_id as number);
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(recipients, null, 2),
              },
            ],
          };
        }

        case "ecm_perform_action": {
          const result = await client.performAction(
            args?.piece_id as number,
            args?.action as string
          );
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

        case "ecm_get_piece_content": {
          const piece = await client.getPiece(
            args?.piece_id as number
          );

          const contentItems: Array<{ type: "text" | "image"; text?: string; data?: string; mimeType?: string }> = [];
          const includeOcr = args?.include_ocr !== false;

          // Add info header
          contentItems.push({
            type: "text" as const,
            text: `Mail piece ${piece.id}: ${piece.page_count_actual || 0} scanned pages\nNote: ECM API only provides envelope images. Scanned document pages are only available via OCR text or send-to-email action.`,
          });

          // Include OCR text if available and requested
          if (includeOcr && piece.ocr_data) {
            contentItems.push({
              type: "text" as const,
              text: `\n--- OCR Text (${piece.page_count_actual} pages) ---\n${piece.ocr_data}`,
            });
          }

          // Fetch envelope image if available
          if (piece.media && piece.media.length > 0) {
            for (const media of piece.media) {
              try {
                const { data, contentType } = await client.fetchMediaContent(media.url);
                if (contentType.startsWith("image/")) {
                  contentItems.push({
                    type: "text" as const,
                    text: `\n--- Envelope Image (${media.tags.join(", ")}) ---`,
                  });
                  contentItems.push({
                    type: "image" as const,
                    data,
                    mimeType: contentType,
                  });
                }
              } catch (err) {
                contentItems.push({
                  type: "text" as const,
                  text: `Failed to fetch envelope image: ${err instanceof Error ? err.message : String(err)}`,
                });
              }
            }
          }

          return { content: contentItems };
        }

        default:
          return {
            content: [
              {
                type: "text" as const,
                text: `Unknown tool: ${name}`,
              },
            ],
            isError: true,
          };
      }
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
