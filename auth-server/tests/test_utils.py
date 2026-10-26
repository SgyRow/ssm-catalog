import pytest

from auth_server.utils import raise_on_empty


def test_raise_on_empty():
    # no exception should be raised as
    # all keys are non-empty
    raise_on_empty(one="1", two="2")

    with pytest.raises(ValueError):
        # should raise ValueError exception
        raise_on_empty(
            one="1",
            two="2",
            three=None  # because value here is None
        )
