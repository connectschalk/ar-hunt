export type CloudSaveUiStatus = "local" | "cloud_ok" | "cloud_error";

let lastStatus: CloudSaveUiStatus = "local";
const listeners = new Set<(s: CloudSaveUiStatus) => void>();

export function getCloudSaveStatus(): CloudSaveUiStatus {
  return lastStatus;
}

export function subscribeCloudSaveStatus(
  listener: (s: CloudSaveUiStatus) => void,
): () => void {
  listeners.add(listener);
  listener(lastStatus);
  return () => {
    listeners.delete(listener);
  };
}

export function setCloudSaveStatus(next: CloudSaveUiStatus): void {
  if (lastStatus === next) return;
  lastStatus = next;
  listeners.forEach((l) => l(next));
}

export function notifyCloudSaveOk(): void {
  setCloudSaveStatus("cloud_ok");
}

export function notifyCloudSaveFailed(): void {
  setCloudSaveStatus("cloud_error");
}

export function resetCloudSaveStatusForLogout(): void {
  setCloudSaveStatus("local");
}
