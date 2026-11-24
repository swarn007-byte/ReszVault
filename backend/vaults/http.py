from rest_framework.exceptions import APIException


class RequestError(APIException):
    def __init__(self, status_code, detail):
        self.status_code = status_code
        super().__init__(detail)
