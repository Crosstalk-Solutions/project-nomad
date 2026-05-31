FROM alpine:3.20
RUN apk add --no-cache util-linux bash
# Create non-root user for security (CWE-250: Execution with Unnecessary Privileges)
RUN adduser -D -u 1000 nomaduser
COPY collect-disk-info.sh /usr/local/bin/collect-disk-info.sh
RUN chmod +x /usr/local/bin/collect-disk-info.sh && mkdir -p /storage
WORKDIR /storage
USER nomaduser
CMD ["/usr/local/bin/collect-disk-info.sh"]
