# Rust Testing Library & Pattern Guidelines

## Core Stack
- **Executor:** `cargo test` (built-in)
- **Mocker:** `mockall` (or manual trait fakes/stubs)
- **Acceptance (BDD Tools):** `cucumber` crate
- **Assertions:** Built-in `assert!`, `assert_eq!`, `assert_ne!`

// Production boundary port (defined in parent module so production code compiles)
// The #[automock] macro automatically generates MockThreads for use-cases
#[mockall::automock]
pub trait Threads {
    fn save(&self, title: &str);
}

## 1. Unit Testing
- Structure unit tests natively using BDD structure (camel_case/snake_case naming conventions and Given-When-Then comments, mocking outbound ports with mockall):
  ```rust
  #[cfg(test)]
  mod tests {
      use super::*;

      #[test]
      fn given_empty_store_when_submitting_thread_then_it_is_saved() {
          // Given: Threads is an outbound boundary port interface, permitting mocking under Chicago School rules.
          let mut mock_threads = MockThreads::new();
          mock_threads.expect_save()
              .with(mockall::predicate::eq("Rust Title"))
              .times(1)
              .return_const(());
              
          let use_case = SubmitThreadUseCase::new(&mock_threads);

          // When
          use_case.execute("Rust Title");

          // Then
          // Mockall automatically verifies expectation drop rules on scope exit
      }
  }
  ```

## 2. Component Testing
- Programmatic server bootstrapping (`tokio::spawn` on port 0) and async `testcontainers` crate wiring (using a drop guard to prevent resource leaks on panics):
  ```rust
  #[tokio::test]
  async fn test_component() {
      use testcontainers::runners::AsyncRunner;
      use testcontainers_modules::postgres::Postgres;
      use tokio::net::TcpListener;

      // Start container using modern async-runner (AsyncRunner is supported in testcontainers 0.23+)
      let container = Postgres::default().start().await.unwrap();
      
      // get_host_port_ipv4 is a synchronous method on ContainerAsync
      let port = container.get_host_port_ipv4(5432).unwrap();
      let db_url = format!("postgres://postgres:postgres@localhost:{}/postgres", port);

      // Asynchronously bind to port 0 for parallel test execution safety
      let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
      let addr = listener.local_addr().unwrap();
      
      // Server handles connections in background task
      let server_handle = tokio::spawn(run_server(listener, db_url));

      // Drop guard generic type T guarantees server.abort() is called even if assertions panic
      struct ServerGuard<T>(tokio::task::JoinHandle<T>);
      impl<T> Drop for ServerGuard<T> {
          fn drop(&mut self) {
              self.0.abort();
          }
      }
      let _guard = ServerGuard(server_handle);

      let client = reqwest::Client::new();
      let resp = client.post(format!("http://{}/threads", addr))
          .json(&serde_json::json!({"title": "Rust Component"}))
          .send()
          .await
          .unwrap();
      assert_eq!(resp.status(), reqwest::StatusCode::OK);
  }
  ```

## 3. Acceptance Testing
- **Physical Separation & Command Execution:** Store acceptance tests in the Cargo integration tests directory (e.g. `tests/acceptance.rs`) driven by the `cucumber` crate. Execute them using cargo:
  - `cargo test --lib` (Runs only fast, sub-second unit developer loop)
  - `cargo test --test component` (Runs booted component specs)
  - `cargo test --test acceptance` (Runs only the cucumber acceptance specs)
- **Step Definition Example:**
  ```rust
  use cucumber::{when, World};

  #[when(expr = "a user submits a thread titled {string}")]
  async fn user_submits_thread(w: &mut MyWorld, title: String) {
      // Step definition executing against API, HTTP client or memory context
  }
  ```
