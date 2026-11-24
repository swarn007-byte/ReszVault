class PrivateResponses:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        if request.path.startswith(("/api/auth/", "/api/github/", "/books", "/chat")):
            response["Cache-Control"] = "no-store"
        return response
