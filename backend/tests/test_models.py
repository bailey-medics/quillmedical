"""Tests for database models."""

import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import Role, User
from app.security import hash_password


class TestUserModel:
    """Test User model."""

    def test_create_user(self, db_session: Session):
        """Test creating a user."""
        user = User(
            username="newuser",
            email="new@example.com",
            password_hash=hash_password("password123"),
            is_active=True,
        )
        db_session.add(user)
        db_session.commit()
        db_session.refresh(user)

        assert user.id is not None
        assert user.username == "newuser"
        assert user.email == "new@example.com"
        assert user.is_active is True
        assert user.totp_secret is None
        assert user.is_totp_enabled is False

    def test_user_unique_username(self, db_session: Session, test_user: User):
        """Test that username must be unique."""
        duplicate_user = User(
            username=test_user.username,  # Same username
            email="different@example.com",
            password_hash=hash_password("password"),
        )
        db_session.add(duplicate_user)

        with pytest.raises(IntegrityError):
            db_session.commit()

    def test_user_unique_email(self, db_session: Session, test_user: User):
        """Test that email must be unique."""
        duplicate_user = User(
            username="differentuser",
            email=test_user.email,  # Same email
            password_hash=hash_password("password"),
        )
        db_session.add(duplicate_user)

        with pytest.raises(IntegrityError):
            db_session.commit()

    def test_user_default_values(self, db_session: Session):
        """Test user default values."""
        user = User(
            username="defaultuser",
            email="default@example.com",
            password_hash=hash_password("password"),
        )
        db_session.add(user)
        db_session.commit()
        db_session.refresh(user)

        # Default values
        assert user.is_active is True
        assert user.is_totp_enabled is False
        assert user.totp_secret is None

    def test_user_totp_fields(self, db_session: Session):
        """Test TOTP-related fields."""
        user = User(
            username="totpuser",
            email="totp@example.com",
            password_hash=hash_password("password"),
            totp_secret="JBSWY3DPEHPK3PXP",
            is_totp_enabled=True,
        )
        db_session.add(user)
        db_session.commit()
        db_session.refresh(user)

        assert user.totp_secret == "JBSWY3DPEHPK3PXP"
        assert user.is_totp_enabled is True

    def test_user_relationships(self, db_session: Session):
        """Test user has roles relationship."""
        user = User(
            username="reluser",
            email="rel@example.com",
            password_hash=hash_password("password"),
        )
        db_session.add(user)
        db_session.commit()

        # Should have empty roles list
        assert hasattr(user, "roles")
        assert isinstance(user.roles, list)
        assert len(user.roles) == 0


class TestRoleModel:
    """Test Role model."""

    def test_create_role(self, db_session: Session):
        """Test creating a role."""
        role = Role(name="TestRole")
        db_session.add(role)
        db_session.commit()
        db_session.refresh(role)

        assert role.id is not None
        assert role.name == "TestRole"

    def test_role_unique_name(self, db_session: Session):
        """Test that role name must be unique."""
        role1 = Role(name="UniqueRole")
        db_session.add(role1)
        db_session.commit()

        role2 = Role(name="UniqueRole")  # Same name
        db_session.add(role2)

        with pytest.raises(IntegrityError):
            db_session.commit()

    def test_role_relationships(self, db_session: Session):
        """Test role has users relationship."""
        role = Role(name="RelRole")
        db_session.add(role)
        db_session.commit()

        # Should have empty users list
        assert hasattr(role, "users")
        assert isinstance(role.users, list)
        assert len(role.users) == 0


class TestUserRoleRelationship:
    """Test many-to-many relationship between User and Role."""

    def test_assign_role_to_user(self, db_session: Session):
        """Test assigning a role to a user."""
        user = User(
            username="roleuser",
            email="roleuser@example.com",
            password_hash=hash_password("password"),
        )
        role = Role(name="TestRole")

        db_session.add(user)
        db_session.add(role)
        db_session.commit()

        # Assign role to user
        user.roles.append(role)
        db_session.commit()
        db_session.refresh(user)

        # Verify relationship
        assert len(user.roles) == 1
        assert user.roles[0].name == "TestRole"

    def test_assign_multiple_roles(self, db_session: Session):
        """Test assigning multiple roles to a user."""
        user = User(
            username="multirole",
            email="multirole@example.com",
            password_hash=hash_password("password"),
        )
        role1 = Role(name="Role1")
        role2 = Role(name="Role2")
        role3 = Role(name="Role3")

        db_session.add_all([user, role1, role2, role3])
        db_session.commit()

        # Assign multiple roles
        user.roles.extend([role1, role2, role3])
        db_session.commit()
        db_session.refresh(user)

        # Verify relationships
        assert len(user.roles) == 3
        role_names = {r.name for r in user.roles}
        assert role_names == {"Role1", "Role2", "Role3"}

    def test_role_has_multiple_users(self, db_session: Session):
        """Test a role can be assigned to multiple users."""
        role = Role(name="SharedRole")
        user1 = User(
            username="user1",
            email="user1@example.com",
            password_hash=hash_password("password"),
        )
        user2 = User(
            username="user2",
            email="user2@example.com",
            password_hash=hash_password("password"),
        )

        db_session.add_all([role, user1, user2])
        db_session.commit()

        # Assign same role to both users
        user1.roles.append(role)
        user2.roles.append(role)
        db_session.commit()
        db_session.refresh(role)

        # Verify relationship from role side
        assert len(role.users) == 2
        usernames = {u.username for u in role.users}
        assert usernames == {"user1", "user2"}

    def test_remove_role_from_user(self, db_session: Session):
        """Test removing a role from a user."""
        user = User(
            username="removeuser",
            email="remove@example.com",
            password_hash=hash_password("password"),
        )
        role = Role(name="RemoveRole")

        db_session.add_all([user, role])
        db_session.commit()

        # Assign and then remove
        user.roles.append(role)
        db_session.commit()
        assert len(user.roles) == 1

        user.roles.remove(role)
        db_session.commit()
        db_session.refresh(user)

        assert len(user.roles) == 0

    def test_eager_loading_roles(
        self, db_session: Session, test_clinician: User
    ):
        """Test that roles are eagerly loaded with User."""
        # Query user from database
        from sqlalchemy import select

        stmt = select(User).where(User.id == test_clinician.id)
        # When joined eager loads against collections are present, the
        # Result may contain duplicate rows for the same entity. Call
        # `unique()` to collapse duplicates before extracting the scalar.
        user = db_session.execute(stmt).unique().scalar_one()

        # Roles should be loaded (no additional query)
        # This is because of lazy="joined" in the relationship
        assert len(user.roles) > 0
        assert user.roles[0].name == "Clinician"
