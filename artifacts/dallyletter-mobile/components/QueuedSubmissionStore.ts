import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  enqueueSubmission as enqueue,
  listQueuedSubmissions as list,
  removeQueuedSubmission as remove,
  updateQueuedSubmission as update,
  type QueuedSubmission,
} from "./QueuedSubmissionStoreCore";

export type { QueuedSubmission } from "./QueuedSubmissionStoreCore";

export const listQueuedSubmissions = (userId: number) => list(AsyncStorage, userId);
export const enqueueSubmission = (item: Omit<QueuedSubmission, "id" | "createdAt" | "attempts">) => enqueue(AsyncStorage, item);
export const removeQueuedSubmission = (userId: number, id: string) => remove(AsyncStorage, userId, id);
export const updateQueuedSubmission = (userId: number, id: string, error: string) => update(AsyncStorage, userId, id, error);
