export function getSearchResultConversionError(params: {
  sourceType: string;
  verificationStatus: string;
  userState: string | null;
  deadlineAt?: Date | string | null;
  now?: Date;
}):
  | "RESULT_REJECTED"
  | "RESULT_DISMISSED"
  | "RESULT_NOT_VERIFIED"
  | "RESULT_EXPIRED"
  | null {
  if (params.verificationStatus === "REJECTED") return "RESULT_REJECTED";
  if (params.userState === "DISMISSED") return "RESULT_DISMISSED";
  if (
    (params.sourceType === "PRIVATE_WEB" || params.sourceType === "LINKEDIN") &&
    params.verificationStatus !== "VERIFIED"
  ) {
    return "RESULT_NOT_VERIFIED";
  }
  if (params.sourceType === "PRIVATE_WEB" && params.deadlineAt) {
    const deadline =
      params.deadlineAt instanceof Date
        ? params.deadlineAt
        : new Date(params.deadlineAt);
    if (
      !Number.isNaN(deadline.getTime()) &&
      deadline.getTime() <= (params.now ?? new Date()).getTime()
    ) {
      return "RESULT_EXPIRED";
    }
  }
  return null;
}

export function canReturnExistingLeadToUser(
  leadOwnerUserId: string | null,
  userId: string,
): boolean {
  return leadOwnerUserId === userId;
}
