import type {
  WebSearchProvider,
  WebSearchRequest,
  WebSearchResponse,
} from "./contracts";

export class FakeWebSearchProvider implements WebSearchProvider {
  readonly name = "FAKE";

  constructor(
    private readonly resolver: (
      request: WebSearchRequest,
      queryFamily: string,
    ) => WebSearchResponse | Promise<WebSearchResponse>,
  ) {}

  search(
    request: WebSearchRequest,
    context?: { queryFamily?: string },
  ): Promise<WebSearchResponse> {
    return Promise.resolve(
      this.resolver(request, context?.queryFamily ?? "unknown"),
    );
  }
}
