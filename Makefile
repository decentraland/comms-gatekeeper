DOCKER_COMPOSE_EXISTS = $(shell which docker-compose > /dev/null && echo 1 || echo 0)

RUN_SERVICES = docker-compose -f docker-compose.local.yml up -d && docker exec comms-gatekeeper_db bash -c "until pg_isready; do sleep 1; done" > /dev/null && sleep 5
RUN_TEST_SERVICES = docker-compose -f docker-compose.test.yml up -d && docker exec comms-gatekeeper_test_db bash -c "until pg_isready; do sleep 1; done" > /dev/null && sleep 5
LOCAL_DB = $(shell docker ps | grep comms-gatekeeper_db > /dev/null && echo 1 || echo 0)

run-services:
ifeq ($(DOCKER_COMPOSE_EXISTS), 1)
	@$(RUN_SERVICES)
else
	@$(ERROR) "Install Docker in order to run the local DB"
	@exit 1;
endif

run-test-services:
ifeq ($(DOCKER_COMPOSE_EXISTS), 1)
	@$(RUN_TEST_SERVICES)
else
	@$(ERROR) "Install Docker in order to run the local DB"
	@exit 1;
endif

stop-services:
	-@docker stop comms-gatekeeper_db

stop-test-services:
	-@docker stop comms-gatekeeper_test_db
	-@docker rm comms-gatekeeper_test_db

# Local testing
tests: 
ifeq ($(LOCAL_DB), 1)
	@make stop-services
	@make run-test-services 
	-@yarn test
	@make stop-test-services
else
	@make run-test-services
	-@yarn test
	@make stop-test-services
endif