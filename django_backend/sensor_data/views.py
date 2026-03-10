from rest_framework.generics import ListAPIView
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework import status
from google.cloud import pubsub_v1
import json

from .models import RawSensorData, EnrichedSensorData, HubConfig, HabitatZone
from .serializers import RawSensorSerializer, EnrichedSensorSerializer, HubConfigSerializer, HabitatZoneSerializer

import secrets
import string
import traceback

class RawSensorListView(ListAPIView):
    queryset = RawSensorData.objects.all().order_by("-datetime")
    serializer_class = RawSensorSerializer

class HabitatZoneListView(ListAPIView):
    queryset = HabitatZone.objects.all()
    serializer_class = HabitatZoneSerializer

class EnrichedSensorListView(APIView):
    def get(self, request):
        try:
            queryset = EnrichedSensorData.objects.all().order_by("-datetime")
            sensor_name = request.query_params.get("sensor_name")
            hub_id = request.query_params.get("hub_id")

            if sensor_name:
                queryset = queryset.filter(sensor_name=sensor_name)
            if hub_id:
                queryset = queryset.filter(hub_id=hub_id)

            serializer = EnrichedSensorSerializer(queryset, many=True)
            return Response(serializer.data, status=status.HTTP_200_OK)
        except Exception as e:
            print("Error in EnrichedSensorListView:", str(e))
            traceback.print_exc()
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

class HubListView(APIView):
    def get(self, request):
        try:
            hubs = HubConfig.objects.all()
            serializer = HubConfigSerializer(hubs, many=True)
            return Response(serializer.data, status=status.HTTP_200_OK)
        except Exception as e:
            print("Error in HubListView:", str(e))
            traceback.print_exc()
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

class HubProvisionView(APIView):
    def post(self, request):
        try:
            hub_id = ''.join(secrets.choice(string.ascii_letters + string.digits) for _ in range(20))
            data = request.data.copy()
            data['hub_id'] = hub_id

            serializer = HubConfigSerializer(data=data)
            if serializer.is_valid():
                serializer.save()
                return Response(serializer.data, status=status.HTTP_201_CREATED)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            print("Error in HubProvisionView:", str(e))
            traceback.print_exc()
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        
class SendHubCommand(APIView):
    def post(self, request):
        try:
            hub_id = request.data.get("hub_id")
            command = request.data.get("command")

            print("Received hub_id:", hub_id)
            print("Received command:", command)

            if not hub_id or not command:
                return Response({"error": "hub_id and command are required"}, status=status.HTTP_400_BAD_REQUEST)

            publisher = pubsub_v1.PublisherClient()
            topic_path = publisher.topic_path("interviewing-457222", "hub-commands")
            payload = json.dumps({
                "hub_id": hub_id,
                "command": command,
                "collection_type": "command"
            }).encode("utf-8")

            future = publisher.publish(topic_path, payload)
            msg_id = future.result()
            print("Published command with msg_id:", msg_id)

            return Response({"status": "published", "msg_id": msg_id}, status=status.HTTP_200_OK)
        except Exception as e:
            print("Error in SendHubCommand:", str(e))
            traceback.print_exc()
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
