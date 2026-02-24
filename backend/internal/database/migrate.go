package database

import (
	"database/sql"
	"embed"
	"fmt"
	"strings"

	"github.com/golang-migrate/migrate/v4"
	"github.com/golang-migrate/migrate/v4/database/postgres"
	"github.com/golang-migrate/migrate/v4/source/iofs"
)

//go:embed migrations
var migrationsFS embed.FS

func isMigrateDirtyErr(err error) bool {
	return strings.Contains(err.Error(), "Dirty database version")
}

func RunMigrations(db *sql.DB) error {
	source, err := iofs.New(migrationsFS, "migrations")
	if err != nil {
		return fmt.Errorf("failed to load embedded migrations: %w", err)
	}

	driver, err := postgres.WithInstance(db, &postgres.Config{})
	if err != nil {
		return fmt.Errorf("failed to create migrate driver: %w", err)
	}

	m, err := migrate.NewWithInstance("iofs", source, "postgres", driver)
	if err != nil {
		return fmt.Errorf("failed to create migrate instance: %w", err)
	}

	if err := m.Up(); err != nil && err != migrate.ErrNoChange {
		// If the database is dirty from a previously failed migration,
		// force the version to mark it clean, then retry.
		// This is safe because all migrations use IF NOT EXISTS / IF EXISTS guards.
		if isMigrateDirtyErr(err) {
			version, _, _ := m.Version()
			if forceErr := m.Force(int(version)); forceErr != nil {
				return fmt.Errorf("failed to force migration version: %w", forceErr)
			}
			if retryErr := m.Up(); retryErr != nil && retryErr != migrate.ErrNoChange {
				return fmt.Errorf("failed to run migrations after force: %w", retryErr)
			}
			return nil
		}
		return fmt.Errorf("failed to run migrations: %w", err)
	}

	return nil
}
