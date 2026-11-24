FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1
WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt \
    && addgroup --system reszvault \
    && adduser --system --home /home/reszvault --ingroup reszvault reszvault \
    && install -d -o reszvault -g reszvault /app/staticfiles

COPY --chown=reszvault:reszvault . .
USER reszvault
EXPOSE 8000
CMD ["gunicorn", "config.wsgi:application", "--bind", "0.0.0.0:8000", "--worker-class", "gthread", "--threads", "4", "--timeout", "120"]
