export interface Reminder {
    id: string;
    groupId: string;
    message: string;
    scheduleTime: number;
    createdBy: string;
    isCompleted: boolean;
    TTL?: number;
    isRecurring?: boolean;
    recurringPattern?: {
        dayOfMonth?: number;  // 毎月の日付 (1-31)
        hour?: number;        // 時間 (0-23)
        minute?: number;      // 分 (0-59)
    };
}
