export function getSearchResultConversionError(params: {
  sourceType: string;
  verificationStatus: string;
  userState: string | null;
}): "RESULT_REJECTED" | "RESULT_DISMISSED" | "RESULT_NOT_VERIFIED" | null {
  if (params.verificationStatus === "REJECTED") return "RESULT_REJECTED";
  if (params.userState === "DISMISSED") return "RESULT_DISMISSED";
  if (
    (params.sourceType === "PRIVATE_WEB" || params.sourceType === "LINKEDIN") &&
    params.verificationStatus !== "VERIFIED"
  ) {
    return "RESULT_NOT_VERIFIED";
  }
  return null;
}
