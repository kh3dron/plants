IMAGE_NAME=plants-static-site
CONTAINER_NAME=plants-static-site
PORT=3000

build:
    docker build -t $(IMAGE_NAME) .

run:
    docker run --rm -it -p $(PORT):3000 --name $(CONTAINER_NAME) $(IMAGE_NAME)

stop:
    docker stop $(CONTAINER_NAME) || true

clean:
    docker rmi $(IMAGE_NAME) || true