import json
import os
import boto3
from linebot import LineBotApi, WebhookHandler
from linebot.models import MessageEvent, TextMessage, TextSendMessage
import uuid
from datetime import datetime

line_bot_api = LineBotApi(os.environ['LINE_CHANNEL_ACCESS_TOKEN'])
handler = WebhookHandler(os.environ['LINE_CHANNEL_SECRET'])
dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table('Reminders')

def lambda_handler(event, context):
    signature = event['headers'].get('X-Line-Signature', '')
    body = event['body']
    
    @handler.add(MessageEvent, message=TextMessage)
    def handle_message(line_event):
        text = line_event.message.text
        if text.startswith('!remind'):
            result = parse_reminder_command(text)
            if result:
                schedule_pattern, reminder_time, message = result
                dynamodb_util = DynamoDBUtil('Reminders')
                dynamodb_util.create_reminder(
                    line_event.source.group_id,
                    message,
                    reminder_time,
                    schedule_pattern
                )
                line_bot_api.reply_message(
                    line_event.reply_token,
                    TextSendMessage(text=f'リマインダーを設定しました: {message} ({reminder_time})')
                )
        elif text.startswith('!list'):
            list_reminders(line_event)

    try:
        handler.handle(body, signature)
    except Exception as e:
        return {
            'statusCode': 400,
            'body': json.dumps({'error': str(e)})
        }

    return {
        'statusCode': 200,
        'body': json.dumps({'message': 'OK'})
    }

def parse_reminder_command(text):
    """
    !remind monthly 15 10:00 会議の時間です
    のような形式をパース
    """
    parts = text.split()
    if len(parts) < 5:
        return None
    
    if parts[1] == 'monthly':
        try:
            day = int(parts[2])
            time = parts[3]
            message = ' '.join(parts[4:])
            if 1 <= day <= 31 and len(time.split(':')) == 2:
                schedule_pattern = f"monthly_{day}_{time}"
                next_reminder = get_next_monthly_reminder(day, time)
                return schedule_pattern, next_reminder, message
        except ValueError:
            pass
    return None

def get_next_monthly_reminder(day, time):
    now = datetime.now()
    if now.day > day or (now.day == day and now.strftime('%H:%M') > time):
        # 来月の指定日
        next_month = now.month + 1 if now.month < 12 else 1
        next_year = now.year if now.month < 12 else now.year + 1
    else:
        # 今月の指定日
        next_month = now.month
        next_year = now.year
    
    return f"{next_year}-{next_month:02d}-{day:02d} {time}"