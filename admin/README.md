
## Docker container
```
docker run --rm -it -p 8080:8080 jturnercosmistack/projectnomad:admin-latest -e PORT=8080 -e HOST=0.0.0.0 -e APP_KEY=secretlongpasswordsecret -e LOG_LEVEL=debug -e DRIVE_DISK=fs
```