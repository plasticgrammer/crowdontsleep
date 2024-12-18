import os
import boto3
from linebot import LineBotApi
from linebot.models import TextSendMessage
from datetime import datetime
import calendar

line_bot_api = LineBotApi(os.environ['LINE_CHANNEL_ACCESS_TOKEN'])
dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table('Reminders')

def should_execute_reminder(schedule_pattern, now):
    # 毎月X日HH:MM形式のパターンをチェック
    if schedule_pattern.startswith('monthly'):
        _, day, time = schedule_pattern.split('_')
        return now.day == int(day) and now.strftime('%H:%M') == time
    return False

def get_next_execution_time(schedule_pattern, now):
    if schedule_pattern.startswith('monthly'):
        _, day, time = schedule_pattern.split('_')
        hour, minute = time.split(':')
        # 来月の同じ日時を設定
        next_month = now.month + 1 if now.month < 12 else 1
        next_year = now.year if now.month < 12 else now.year + 1
        return f"{next_year}-{next_month:02d}-{day:02d} {hour}:{minute}"

def lambda_handler(event, context):
    now = datetime.now()
    now_str = now.strftime('%Y-%m-%d %H:%M')
    
    response = table.scan(
        FilterExpression='reminder_time = :now',
        ExpressionAttributeValues={':now': now_str}
    )
    
    for item in response['Items']:
        line_bot_api.push_message(
            item['group_id'],
            TextSendMessage(text=item['message'])
        )
        
        if item.get('is_recurring'):
            # 定期実行の場合は次回の実行時間を設定
            next_time = get_next_execution_time(item['schedule_pattern'], now)
            table.update_item(
                Key={
                    'group_id': item['group_id'],
                    'reminder_id': item['reminder_id']
                },
                UpdateExpression='SET reminder_time = :t',
                ExpressionAttributeValues={':t': next_time}
            )
        else:
            # 1回限りの場合は削除
            table.delete_item(
                Key={
                    'group_id': item['group_id'],
                    'reminder_id': item['reminder_id']
                }
            )