FROM alpine:3.20

# Install Docker CLI for compose operations
RUN apk add --no-cache docker-cli docker-cli-compose bash

# Copy the update watcher script
COPY update-watcher.sh /usr/local/bin/update-watcher.sh
RUN chmod +x /usr/local/bin/update-watcher.sh

# Create shared communication directory
RUN mkdir -p /shared

WORKDIR /shared

CMD ["/usr/local/bin/update-watcher.sh"]
