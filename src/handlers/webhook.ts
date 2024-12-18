import { APIGatewayProxyHandler } from 'aws-lambda';
import { Client, validateSignature, WebhookEvent } from '@line/bot-sdk';
import { DynamoService } from '../services/dynamo-service';

const config = {
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN!,
    channelSecret: process.env.LINE_CHANNEL_SECRET!
};

const lineClient = new Client(config);
const dynamoService = new DynamoService();

export const handler: APIGatewayProxyHandler = async (event) => {
    if (!validateSignature(event.body!, config.channelSecret, event.headers['x-line-signature'])) {
        return { statusCode: 403, body: 'Invalid signature' };
    }

    const body = JSON.parse(event.body!);
    const events: WebhookEvent[] = body.events;

    for (const lineEvent of events) {
        if (lineEvent.type === 'message' && lineEvent.message.type === 'text') {
            const { text } = lineEvent.message;
            
            if (text === '!remind list') {
                // リマインド一覧表示
                const reminders = await dynamoService.listReminders(lineEvent.source.groupId!);
                const reminderList = reminders.map(r => {
                    if (r.isRecurring && r.recurringPattern) {
                        return `ID: ${r.id} (毎月${r.recurringPattern.dayOfMonth}日${r.recurringPattern.hour}:${r.recurringPattern.minute}) ${r.message}`;
                    }
                    return `ID: ${r.id} (${new Date(r.scheduleTime).toLocaleString()}) ${r.message}`;
                }).join('\n');
                
                await lineClient.replyMessage(lineEvent.replyToken, {
                    type: 'text',
                    text: reminderList || 'リマインドはありません'
                });
            } else if (text.startsWith('!remind delete ')) {
                // リマインド削除
                const id = text.split(' ')[2];
                await dynamoService.deleteReminder(id);
                await lineClient.replyMessage(lineEvent.replyToken, {
                    type: 'text',
                    text: `ID: ${id} のリマインドを削除しました`
                });
            } else if (text.startsWith('!remind ')) {
                const parts = text.split(' ');
                const timeSpec = parts[1];
                const message = parts.slice(2).join(' ');

                // 毎月指定の形式: "毎月15日10:30"
                if (timeSpec.startsWith('毎月')) {
                    const pattern = timeSpec.match(/毎月(\d{1,2})日(\d{1,2}):(\d{1,2})/);
                    if (pattern) {
                        const [_, day, hour, minute] = pattern.map(Number);
                        
                        await dynamoService.saveReminder({
                            id: Date.now().toString(),
                            groupId: lineEvent.source.groupId!,
                            message,
                            scheduleTime: Date.now(), // ダミー値
                            createdBy: lineEvent.source.userId!,
                            isCompleted: false,
                            isRecurring: true,
                            recurringPattern: {
                                dayOfMonth: day,
                                hour,
                                minute
                            }
                        });

                        await lineClient.replyMessage(lineEvent.replyToken, {
                            type: 'text',
                            text: `毎月${day}日${hour}:${minute}にリマインドを設定しました: ${message}`
                        });
                    }
                } else {
                    const [_, timeStr, ...messageParts] = text.split(' ');
                    const message = messageParts.join(' ');
                    
                    const scheduleTime = new Date();
                    if (timeStr.endsWith('分後')) {
                        const minutes = parseInt(timeStr);
                        scheduleTime.setMinutes(scheduleTime.getMinutes() + minutes);
                    }

                    await dynamoService.saveReminder({
                        id: Date.now().toString(),
                        groupId: lineEvent.source.groupId!,
                        message,
                        scheduleTime: scheduleTime.getTime(),
                        createdBy: lineEvent.source.userId!,
                        isCompleted: false
                    });

                    await lineClient.replyMessage(lineEvent.replyToken, {
                        type: 'text',
                        text: `${timeStr}にリマインドを設定しました: ${message}`
                    });
                }
            }
        }
    }

    return { statusCode: 200, body: 'OK' };
};
