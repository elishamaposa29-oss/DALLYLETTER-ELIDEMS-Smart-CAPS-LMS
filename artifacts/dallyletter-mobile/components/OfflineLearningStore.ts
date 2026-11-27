import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  listOfflineLearningRecords as list,
  putOfflineLearningRecord as put,
  removeOfflineLearningRecord as remove,
  pruneOfflineLearningRecords as prune,
  type OfflineLearningKind,
  type OfflineLearningRecord,
} from "./OfflineLearningStoreCore";

export type { OfflineLearningKind, OfflineLearningRecord };
export const listOfflineLearningRecords = (userId: number) => list(AsyncStorage, userId);
export const putOfflineLearningRecord = (userId: number, kind: OfflineLearningKind, id: string, value: unknown) => put(AsyncStorage, userId, kind, id, value);
export const removeOfflineLearningRecord = (userId: number, kind: OfflineLearningKind, id: string) => remove(AsyncStorage, userId, kind, id);
export const pruneOfflineLearningRecords = (userId: number) => prune(AsyncStorage, userId);
