import { DynamoDB } from 'aws-sdk';
import { Reminder } from '../models/reminder';

export class DynamoService {
    private docClient: DynamoDB.DocumentClient;
    private tableName: string;

    constructor() {
        this.docClient = new DynamoDB.DocumentClient();
        this.tableName = process.env.DYNAMODB_TABLE!;
    }

    async saveReminder(reminder: Reminder): Promise<void> {
        const item = {
            ...reminder,
            TTL: Math.floor(reminder.scheduleTime / 1000) + 86400
        };

        await this.docClient.put({
            TableName: this.tableName,
            Item: item
        }).promise();
    }

    async getPendingReminders(): Promise<Reminder[]> {
        const now = new Date();
        const currentTime = now.getTime();

        // 通常のリマインダーを取得
        const normalReminders = await this.getNormalPendingReminders(currentTime);
        
        // 定期実行リマインダーを取得
        const recurringReminders = await this.getRecurringPendingReminders(now);

        return [...normalReminders, ...recurringReminders];
    }

    private async getNormalPendingReminders(currentTime: number): Promise<Reminder[]> {
        const result = await this.docClient.scan({
            TableName: this.tableName,
            FilterExpression: 'isCompleted = :false AND scheduleTime <= :now AND attribute_not_exists(isRecurring)',
            ExpressionAttributeValues: {
                ':false': false,
                ':now': currentTime
            }
        }).promise();

        return result.Items as Reminder[];
    }

    private async getRecurringPendingReminders(now: Date): Promise<Reminder[]> {
        const result = await this.docClient.scan({
            TableName: this.tableName,
            FilterExpression: 'isRecurring = :true',
            ExpressionAttributeValues: {
                ':true': true
            }
        }).promise();

        return (result.Items as Reminder[]).filter(reminder => {
            if (!reminder.recurringPattern) return false;

            const { dayOfMonth, hour, minute } = reminder.recurringPattern;
            return dayOfMonth === now.getDate() &&
                   hour === now.getHours() &&
                   minute === now.getMinutes();
        });
    }

    async markAsCompleted(id: string, isRecurring: boolean = false): Promise<void> {
        if (!isRecurring) {
            await this.docClient.update({
                TableName: this.tableName,
                Key: { id },
                UpdateExpression: 'set isCompleted = :true',
                ExpressionAttributeValues: {
                    ':true': true
                }
            }).promise();
        }
        // 定期実行の場合は完了マークを付けない
    }

    async deleteReminder(id: string): Promise<void> {
        await this.docClient.delete({
            TableName: this.tableName,
            Key: { id }
        }).promise();
    }

    async listReminders(groupId: string): Promise<Reminder[]> {
        const result = await this.docClient.scan({
            TableName: this.tableName,
            FilterExpression: 'groupId = :groupId AND (isCompleted = :false OR isRecurring = :true)',
            ExpressionAttributeValues: {
                ':groupId': groupId,
                ':false': false,
                ':true': true
            }
        }).promise();

        return result.Items as Reminder[];
    }
}
