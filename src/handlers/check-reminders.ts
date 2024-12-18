import { Handler } from 'aws-lambda';
import { Client } from '@line/bot-sdk';
import { DynamoService } from '../services/dynamo-service';

const config = {
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN!,
    channelSecret: process.env.LINE_CHANNEL_SECRET!
};

const lineClient = new Client(config);
const dynamoService = new DynamoService();

export const handler: Handler = async () => {
    const pendingReminders = await dynamoService.getPendingReminders();

    for (const reminder of pendingReminders) {
        await lineClient.pushMessage(reminder.groupId, {
            type: 'text',
            text: `⏰ ${reminder.isRecurring ? '定期' : ''}リマインド: ${reminder.message}`
        });
        await dynamoService.markAsCompleted(reminder.id, !!reminder.isRecurring);
    }
};
