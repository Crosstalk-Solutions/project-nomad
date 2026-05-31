FROM alpine:3.20

# Install Docker CLI for compose operations
RUN apk add --no-cache docker-cli docker-cli-compose bash jq

# Create non-root user for security (CWE-250: Execution with Unnecessary Privileges)
RUN adduser -D -u 1000 nomaduser

# Copy the update watcher script
COPY update-watcher.sh /usr/local/bin/update-watcher.sh
RUN chmod +x /usr/local/bin/update-watcher.sh

# Create shared communication directory
RUN mkdir -p /shared

WORKDIR /shared
USER nomaduser
CMD ["/usr/local/bin/update-watcher.sh"]
