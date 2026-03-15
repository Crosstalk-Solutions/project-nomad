FROM alpine:3.20
RUN apk add --no-cache util-linux bash
COPY collect-disk-info.sh /usr/local/bin/collect-disk-info.sh
RUN chmod +x /usr/local/bin/collect-disk-info.sh && mkdir -p /storage
WORKDIR /storage
CMD ["/usr/local/bin/collect-disk-info.sh"]
