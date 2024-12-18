import boto3
import uuid
from datetime import datetime

class DynamoDBUtil:
    def __init__(self, table_name):
        self.table = boto3.resource('dynamodb').Table(table_name)
    
    def create_reminder(self, group_id, message, reminder_time, schedule_pattern=None):
        item = {
            'reminder_id': str(uuid.uuid4()),
            'group_id': group_id,
            'message': message,
            'reminder_time': reminder_time
        }
        if schedule_pattern:
            item['schedule_pattern'] = schedule_pattern
            item['is_recurring'] = True
        return self.table.put_item(Item=item)

    def list_reminders(self, group_id):
        response = self.table.scan(
            FilterExpression='group_id = :gid',
            ExpressionAttributeValues={':gid': group_id}
        )
        return response['Items']